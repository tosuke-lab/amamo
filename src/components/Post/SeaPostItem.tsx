import { Fragment, memo } from 'react';
import { NodeType } from '@linkage-community/bottlemail';
import * as pictograph from 'pictograph';
import { SeaPost } from '@/models/SeaPost';
import { filterThumbnailVariants, SeaFileVariant, SeaFile } from '@/models/SeaFile';
import {
  IconAvatar,
  TextAvatar,
  LinkText,
  BoldText,
  PostBodyTextWrapper,
  PostFooter,
  PostFooterBadge,
  PostItemLayout,
  PostFileList,
  PostNothingItem,
  PostImageItem,
  PostVideoItem,
} from './presenters';
import { RelativeTime } from './RelativeTime';
import { SeaUser } from '@/models/SeaUser';
import { colors } from '@/theme';

const SeaFileVariants: React.FC<{ readonly variants: readonly SeaFileVariant[] }> = ({ variants }) => (
  <>
    {variants.map((v) => (
      <source key={v.id} srcSet={v.url} type={v.mime} />
    ))}
  </>
);

const SeaPostBodyText: React.FC<{ readonly postBody: readonly NodeType[] }> = ({ postBody }) => {
  return (
    <PostBodyTextWrapper>
      {postBody.map((node, i) => {
        switch (node.kind) {
          case 'Link':
            return <LinkText key={i} href={node.value} />;
          case 'Mention':
            return <BoldText key={i}>{node.raw}</BoldText>;
          case 'EmojiName':
            return (
              <span key={i} title={node.raw}>
                {pictograph.dic[node.value] ?? node.raw}
              </span>
            );
          default:
            return <Fragment key={i}>{node.raw}</Fragment>;
        }
      })}
    </PostBodyTextWrapper>
  );
};

const SeaFileThumbnails: React.FC<{ files: readonly SeaFile[] }> = ({ files }) => (
  <PostFileList>
    {files.map((file) => {
      if (file.variants.length === 0) return <PostNothingItem key={file.id} />;
      switch (file.type) {
        case 'image':
          return (
            <PostImageItem
              key={file.id}
              title={file.name}
              sources={<SeaFileVariants variants={filterThumbnailVariants(file)} />}
            />
          );
        case 'video':
          return (
            <PostVideoItem
              key={file.id}
              title={file.name}
              sources={<SeaFileVariants variants={filterThumbnailVariants(file)} />}
            />
          );
        default:
          return null;
      }
    })}
  </PostFileList>
);

export type SeaPostItemProps = {
  readonly post: SeaPost;
  readonly author: SeaUser;
};

export const SeaPostItem = memo<SeaPostItemProps>(function SeaPostItem({ post, author }) {
  const linkToPost = new URL(`posts/${post.id}`, process.env.SEA_URL).href;
  return (
    <PostItemLayout
      authorAvatarContent={
        author.avatarFile ? (
          <IconAvatar
            title={author.avatarFile.name}
            sources={<SeaFileVariants variants={filterThumbnailVariants(author.avatarFile)} />}
          />
        ) : (
          <TextAvatar name={author.name || author.screenName} />
        )
      }
      authorDisplayName={author.name}
      authorScreenName={author.screenName}
      headerRightContent={
        <a className="time" href={linkToPost} rel="noopener noreferrer" target="_target">
          <style jsx>{`
            .time {
              color: ${colors.caption};
            }
          `}</style>
          <RelativeTime time={post.createdAt} />
        </a>
      }
      bodyContent={
        <>
          <SeaPostBodyText postBody={post.textNodes} />
          {post.files.length > 0 && <SeaFileThumbnails files={post.files} />}
          <PostFooter>
            via {post.via.name}
            {post.via.isBot && <PostFooterBadge>Bot</PostFooterBadge>}
          </PostFooter>
        </>
      }
    />
  );
});
