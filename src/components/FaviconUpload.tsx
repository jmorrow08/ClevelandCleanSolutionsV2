import { useRef, useState } from "react";

interface FaviconUploadProps {
  value: string;
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
}

export default function FaviconUpload({
  value,
  onChange,
  disabled = false,
}: FaviconUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFileSelect = (file: File) => {
    if (!file) return;

    // Validate file type
    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/svg+xml",
      "image/x-icon",
      "image/ico",
    ];
    if (!allowedTypes.includes(file.type)) {
      alert("Please select a valid image file (PNG, JPEG, GIF, SVG, ICO)");
      return;
    }

    // Validate file size (1MB limit)
    if (file.size > 1024 * 1024) {
      alert("File size must be less than 1MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      onChange(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleRemove = () => {
    onChange("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <div
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-blue-400 bg-blue-50"
            : "border-gray-300 hover:border-gray-400"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={disabled ? undefined : handleClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/svg+xml,image/x-icon,image/ico"
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled}
        />

        {value ? (
          <div className="space-y-2">
            <div className="text-sm text-gray-600">Current Favicon:</div>
            <img
              src={value}
              alt="Favicon Preview"
              className="mx-auto h-8 w-8 object-contain border rounded"
            />
            <div className="text-xs text-gray-500">
              Click to change or drag & drop a new image
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-gray-500">
              <svg
                className="mx-auto h-8 w-8 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div className="text-sm text-gray-600">
              Click to upload or drag & drop favicon
            </div>
            <div className="text-xs text-gray-500">
              PNG, JPEG, GIF, SVG, ICO (max 1MB)
            </div>
          </div>
        )}
      </div>

      {value && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={disabled}
          className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Remove favicon
        </button>
      )}
    </div>
  );
}
