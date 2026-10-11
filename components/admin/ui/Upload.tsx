"use client";
import { useState } from "react";
import { adminApi } from "../client";
export function Upload({
  label,
  path,
  onSaved,
}: {
  label: string;
  path: string;
  onSaved: () => Promise<unknown>;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <div className="host-upload">
      <label>
        {label}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={pending}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setPending(true);
            setMessage("");
            const data = new FormData();
            data.set("file", file);
            try {
              await adminApi(path, { method: "POST", body: data });
              await onSaved();
              setMessage("Image saved.");
            } catch (error) {
              setMessage(
                error instanceof Error
                  ? error.message
                  : "Upload failed. Your previous image is unchanged.",
              );
            } finally {
              setPending(false);
              event.target.value = "";
            }
          }}
        />
      </label>
      <small role="status">{pending ? "Uploading image…" : message}</small>
    </div>
  );
}
