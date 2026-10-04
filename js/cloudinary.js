import { cloudinary } from "./config.js";

// Sends one picture to Cloudinary and returns its web address.
export async function upload(file) {
  if (file.size > 10 * 1024 * 1024) throw { user: `${file.name} is over 10 MB. Pick a smaller picture.` };
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", cloudinary.uploadPreset);
  let r;
  try {
    r = await fetch(`https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/image/upload`, { method: "POST", body: fd });
  } catch {
    throw { user: "No connection to Cloudinary. Check your data and try again." };
  }
  if (!r.ok) {
    let why = "";
    try { why = (await r.json()).error?.message || ""; } catch {}
    throw { user: why ? `Cloudinary says: ${why}` : "A picture failed to upload. Try again." };
  }
  return (await r.json()).secure_url;
}
