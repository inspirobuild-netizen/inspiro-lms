'use client';

import { useRef, useState } from 'react';
import { createApiClient, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { Button } from '@/components/ui/button';

/**
 * Pick an image → upload to the server (which relays to Bunny Storage) →
 * hand back the CDN URL. Shows a live preview of the current/new image.
 * Server enforces type (JPEG/PNG/WebP) and size (5 MB); the `accept`
 * attribute here is just UX.
 */
export function ImageUpload({
  value,
  onChange,
  label = 'Upload image',
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
}) {
  const { accessToken } = useAuthStore();
  const api = createApiClient(accessToken);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.postForm<{ url: string }>('/api/v1/admin/media/image', form);
      onChange(res.data.url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Upload failed — try again');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt="Thumbnail preview"
          className="w-full max-w-xs aspect-video object-cover rounded-xl border border-white/10"
        />
      ) : (
        <div className="w-full max-w-xs aspect-video rounded-xl border border-dashed border-white/15 bg-surface-2 flex items-center justify-center">
          <span className="text-xs text-slate-500">No image yet</span>
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" loading={uploading} onClick={() => inputRef.current?.click()}>
          {value ? 'Replace' : label}
        </Button>
        {value && (
          <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
            Remove
          </Button>
        )}
      </div>
      <p className="text-xs text-slate-500">JPEG, PNG or WebP · up to 5 MB · shown to students in the app</p>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = ''; // allow re-picking the same file
        }}
      />
    </div>
  );
}
