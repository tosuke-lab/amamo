import ky from 'ky';
import dayjs from 'dayjs';
import QuickLRU from 'quick-lru';
import parse from '@linkage-community/bottlemail';
import { assertIsInteger, assertIsObject, assertIsString, assertIsNumber, assertIsArray } from '../_commons';
import { eventemit } from '@/utils/eventemit';
import { ISO8601DateTime } from '@/models/commons';
import { SeaUserId, SeaUser } from '@/models/SeaUser';
import { SeaFileId, SeaFile, SeaFileVariant } from '@/models/SeaFile';
import { SeaPostId, SeaPost } from '@/models/SeaPost';

export function assertIsISO8601DateTime(x: unknown, name: string = 'value'): asserts x is ISO8601DateTime {
  assertIsString(x, name);
  // FIXME: More strict ISO8601 validation with a simple code
  if (!dayjs(x).isValid()) {
    throw new Error(`${name} must be a valid date string`);
  }
}

// File
function assertIsSeaFileId(x: unknown, name = 'value'): asserts x is SeaFileId {
  assertIsInteger(x, name);
}

function toSeaFileVariant(json: unknown, root = 'res'): SeaFileVariant {
  assertIsObject(json, root);

  const id = json.id;
  assertIsInteger(id, `${root}.id`);

  const score = json.score;
  assertIsNumber(score, `${root}.score`);

  const extension = json.extension;
  assertIsString(extension, `${root}.extension`);

  const type = json.type;
  assertIsString(type, `${root}.type`);

  const size = json.size;
  assertIsNumber(size, `${root}.size`);

  const url = json.url;
  assertIsString(url, `${root}.url`);

  const mime = json.mime;
  assertIsString(mime, `${root}.mime`);

  return {
    id,
    score,
    extension,
    type,
    size,
    url,
    mime,
  } as const;
}

function toSeaFile(json: unknown, root = 'res'): SeaFile {
  assertIsObject(json, root);

  const id = json.id;
  assertIsSeaFileId(id, `${root}.id`);

  const name = json.name;
  assertIsString(name, `${root}.name`);

  const type = json.type;
  assertIsString(type, `${root}.type`);

  const variantJSONs = json.variants;
  assertIsArray(variantJSONs, `${root}.variants`);
  const variants = variantJSONs.map((v, i) => toSeaFileVariant(v, `${root}.variants[${i}]`));

  return {
    id,
    name,
    type,
    variants,
  } as const;
}

// User
function assertIsSeaUserId(x: unknown, name: string = 'value'): asserts x is SeaUserId {
  assertIsInteger(x, name);
}
function toUser(json: unknown, root = 'res') {
  assertIsObject(json, root);

  const id = json.id;
  assertIsSeaUserId(id, `${root}.id`);

  const name = json.name;
  assertIsString(name, `${root}.name`);

  const screenName = json.screenName;
  assertIsString(screenName, `${root}.screenName`);

  const postsCount = json.postsCount;
  assertIsInteger(postsCount, `${root}.postsCount`);

  const createdAt = json.createdAt;
  assertIsISO8601DateTime(createdAt, `${root}.createdAt`);

  const updatedAt = json.updatedAt;
  assertIsISO8601DateTime(updatedAt, `${root}.updatedAt`);

  const avatarFile = json.avatarFile != null ? toSeaFile(json.avatarFile, `${root}.avatarFile`) : undefined;

  const user = {
    id,
    name,
    screenName,
    postsCount,
    createdAt,
    updatedAt,
    avatarFile,
  } as SeaUser;
  return user;
}

// Post
function assertIsSeaPostId(x: unknown, name: string = 'value'): asserts x is SeaPostId {
  assertIsInteger(x, name);
}
function normalizePost(json: unknown, root = 'res') {
  assertIsObject(json, `${root}`);

  const id = json.id;
  assertIsSeaPostId(id, `${root}.id`);

  const text = json.text;
  assertIsString(text, `${root}.text`);
  const textNodes = parse(text);

  const author = toUser(json.user, `${root}.user`);

  const createdAt = json.createdAt;
  assertIsISO8601DateTime(createdAt, `${root}.createdAt`);

  const updatedAt = json.updatedAt;
  assertIsISO8601DateTime(updatedAt, `${root}.updatedAt`);

  const fileJSONs = json.files ?? [];
  assertIsArray(fileJSONs, `${root}.files`);
  const files = fileJSONs.map((file, i) => toSeaFile(file, `${root}.files[${i}]`));

  const app = json.application;
  assertIsObject(app, `${root}.application`);

  const appName = app.name;
  assertIsString(appName, `${root}.application.name`);

  const appIsBot = app.isAutomated ?? false;
  if (typeof appIsBot !== 'boolean') throw new Error(`"${root}.application.isAutomated" must be boolean.`);

  const post: SeaPost = {
    id,
    text,
    textNodes,
    author: author.id,
    createdAt,
    updatedAt,
    files,
    via: {
      name: appName,
      isBot: appIsBot,
    },
  };

  return {
    post,
    user: author,
  };
}

function normalizePostList(json: unknown, root = 'res') {
  assertIsArray(json, root);
  const posts: SeaPost[] = [];
  const users = new Map<SeaUserId, SeaUser>();
  json.forEach((entry, idx) => {
    const { post, user } = normalizePost(entry, `${root}[${idx}]`);
    posts.push(post);
    users.set(user.id, user);
  });
  return {
    posts,
    users: [...users.values()],
  } as const;
}

export const createSeaApi = ({
  baseUrl,
  websocketUrl,
  token,
}: Readonly<{ baseUrl: string; websocketUrl: string; token: string }>) => {
  const http = ky.create({
    prefixUrl: baseUrl,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const userCache = new QuickLRU<SeaUserId, SeaUser>({ maxSize: 100 });
  const postCache = new QuickLRU<SeaPostId, SeaPost>({ maxSize: 3000 });
  return Object.freeze({
    async fetchAccount() {
      const json = await http.get('v1/account').json();
      const user = toUser(json);
      userCache.set(user.id, user);
      return user;
    },
    async fetchPublicTimeline(
      payload: Readonly<{ count?: number; since?: SeaPostId; after?: SeaPostId; search?: string }>,
    ) {
      const params = new URLSearchParams();
      if (payload.count) params.append('count', `${payload.count}`);
      if (payload.since) params.append('sinceId', `${payload.since}`);
      if (payload.after) params.append('maxId', `${payload.after}`);
      if (payload.search) params.append('search', payload.search);
      const json = await http.get('v1/timelines/public', { searchParams: params }).json();
      const data = normalizePostList(json);
      data.posts.forEach((post) => postCache.set(post.id, post));
      data.users.forEach((user) => userCache.set(user.id, user));
      return data;
    },
    async connectPublicTimeline() {
      const ws = new WebSocket(websocketUrl);
      await new Promise((res, rej) => {
        try {
          const onOpen = () => {
            ws.removeEventListener('open', onOpen);
            ws.send(
              JSON.stringify({
                type: 'connect',
                stream: 'v1/timelines/public',
                token,
              }),
            );
            res(void 0);
          };
          const onError = (ev: Event) => {
            ws.removeEventListener('error', onError);
            rej(ev);
          };
          ws.addEventListener('open', onOpen);
          ws.addEventListener('error', onError);
        } catch (e) {
          rej(e);
        }
      });

      const close = () => ws.close();
      const [emitMessage, onMessage] = eventemit<Readonly<{ post: SeaPost; author: SeaUser }>>();
      const [emitClose, onClose] = eventemit<void>();
      ws.addEventListener('message', (ev) => {
        const data: unknown = JSON.parse(ev.data);
        assertIsObject(data);
        if (data.type === 'message') {
          const { post, user } = normalizePost(data.content);
          postCache.set(post.id, post);
          userCache.set(user.id, user);
          emitMessage({ post, author: user });
        }
      });

      const handle = window.setInterval(() => {
        ws.send(JSON.stringify({ type: 'ping' }));
      }, 30 * 1000);
      ws.addEventListener('close', (ev) => {
        ev.reason;
        window.clearInterval(handle);
        emitClose();
      });

      return {
        close,
        onMessage,
        onClose,
      } as const;
    },
    async fetchPost(id: SeaPostId) {
      const post = postCache.get(id);
      if (post) {
        const user = userCache.get(post.author);
        if (user) {
          return {
            post,
            user,
          };
        }
      }
      try {
        const json = await http.get(`v1/posts/${id}`).json();
        const data = normalizePost(json);
        userCache.set(data.user.id, data.user);
        postCache.set(data.post.id, data.post);
        return data;
      } catch (e) {
        if (e instanceof ky.HTTPError && e.response.status === 404) {
          return undefined;
        }
        throw e;
      }
    },
    async post(payload: Readonly<{ text: string; fileIds?: SeaFileId[]; inReplyToId?: SeaPostId }>) {
      const json = await http.post('v1/posts', { json: payload }).json();
      const data = normalizePost(json);
      userCache.set(data.user.id, data.user);
      postCache.set(data.post.id, data.post);
      return data;
    },
  });
};

export type SeaApi = ReturnType<typeof createSeaApi>;
