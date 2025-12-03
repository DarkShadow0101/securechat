// client/src/utils/storageService.js
import { storage } from "./firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

/**
 * Upload a file to Firebase Storage
 * @param {File} file
 * @param {string} path - optional path (default: uploads/<filename>)
 */
export async function uploadFile(file, path = `uploads/${file.name}`) {
  const fileRef = ref(storage, path);
  const snapshot = await uploadBytes(fileRef, file);
  return await getDownloadURL(snapshot.ref);
}

/**
 * Get download URL of any file by path
 */
export async function getFileUrl(path) {
  const fileRef = ref(storage, path);
  return await getDownloadURL(fileRef);
}
