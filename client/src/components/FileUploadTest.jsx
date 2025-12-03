// client/src/components/FileUploadTest.jsx
import { useState } from "react";
import { uploadFile } from "../utils/storageService"; // note relative path

export default function FileUploadTest() {
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState("");

  async function handleUpload() {
    if (!file) return alert("Pick a file first!");
    try {
      const downloadUrl = await uploadFile(file);
      setUrl(downloadUrl);
      console.log("Uploaded:", downloadUrl);
    } catch (err) {
      console.error(err);
      alert("Upload failed: " + err.message);
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <button onClick={handleUpload} style={{ marginLeft: 8 }}>Upload</button>
      {url && (
        <p>
          Uploaded: <a href={url} target="_blank" rel="noreferrer">Open</a>
        </p>
      )}
    </div>
  );
}
