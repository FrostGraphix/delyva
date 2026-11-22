import type { UploadContentType, UploadPurpose } from '@delyva/contracts';
import { UploadContentTypeSchema } from '@delyva/contracts';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { api } from '../api/client';
import { newId } from '../lib/ids';

/** Picked file ready to upload. */
interface Picked {
  readonly blob: Blob;
  readonly contentType: UploadContentType;
}

/** Opens the camera (selfie on a device) or the photo library; null when cancelled. */
async function pick(purpose: UploadPurpose): Promise<Picked | null> {
  const useCamera = purpose === 'selfie' && Platform.OS !== 'web';
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.7,
    ...(useCamera ? { cameraType: ImagePicker.CameraType.front } : {}),
  };
  const res = useCamera
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  const asset = res.canceled ? undefined : res.assets[0];
  if (!asset) return null;
  const blob = await (await fetch(asset.uri)).blob();
  const type = UploadContentTypeSchema.safeParse(asset.mimeType ?? blob.type);
  if (!type.success) throw new Error('unsupported file type');
  return { blob, contentType: type.data };
}

/**
 * Picks an image and uploads it through a signed, expiring URL (POST /v1/uploads, then PUT the
 * bytes). Returns the upload id, or null when the rider cancelled.
 */
export async function pickAndUpload(purpose: UploadPurpose): Promise<string | null> {
  const picked = await pick(purpose);
  if (!picked) return null;
  const ticket = await api.createUpload(
    { purpose, contentType: picked.contentType, sizeBytes: picked.blob.size },
    newId(),
  );
  const put = await fetch(ticket.url, {
    method: ticket.method,
    headers: { 'content-type': picked.contentType, ...ticket.headers },
    body: picked.blob,
  });
  if (!put.ok) throw new Error(`upload failed (${String(put.status)})`);
  return ticket.uploadId;
}
