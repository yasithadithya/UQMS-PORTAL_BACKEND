import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getR2Client, getR2Config } from '../config/r2';

export type R2UploadResult = {
  key: string;
  bucket: string;
  url?: string;
  etag?: string;
};

type UploadToR2Params = {
  key: string;
  body: Buffer;
  contentType?: string;
  contentLength?: number;
};

export const uploadToR2 = async (params: UploadToR2Params): Promise<R2UploadResult> => {
  const { bucket, publicBaseUrl } = getR2Config();
  const client = getR2Client();

  const result = await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      ContentLength: params.contentLength,
    })
  );

  const url = publicBaseUrl ? `${publicBaseUrl.replace(/\/$/, '')}/${params.key}` : undefined;

  return {
    key: params.key,
    bucket,
    url,
    etag: result.ETag,
  };
};

export const deleteFromR2 = async (key: string): Promise<void> => {
  const { bucket } = getR2Config();
  const client = getR2Client();

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
};
