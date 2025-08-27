// Image loading utilities for better reliability

export const DEFAULT_IMAGE_PLACEHOLDER =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0yMCAyMEg2MFY2MEgyMFYyMFoiIGZpbGw9IiNEMUQ1REIiLz4KPHBhdGggZD0iTTI1IDI1SDU1VjU1SDI1VjI1WiIgZmlsbD0iI0YzRjRGNiIvPgo8Y2lyY2xlIGN4PSIzNSIgY3k9IjM1IiByPSI1IiBmaWxsPSIjOUI5QkEwIi8+CjxwYXRoIGQ9Ik0yMCA1NUwzMCA0NUw0MCA1NUw1MCA0NUw2MCA1NVY2MEgyMFY1NVoiIGZpbGw9IiM5QjlCQTAiLz4KPC9zdmc+";

// Image loading with retry logic
export function loadImageWithRetry(
  src: string,
  maxRetries: number = 3,
  retryDelay: number = 1000
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    let retryCount = 0;

    function attemptLoad() {
      const img = new Image();

      img.onload = () => {
        console.log(`Successfully loaded image: ${src}`);
        resolve(img);
      };

      img.onerror = () => {
        retryCount++;
        console.warn(
          `Failed to load image (attempt ${retryCount}/${maxRetries}): ${src}`
        );

        if (retryCount < maxRetries) {
          setTimeout(attemptLoad, retryDelay);
        } else {
          console.error(
            `Failed to load image after ${maxRetries} attempts: ${src}`
          );
          reject(new Error(`Failed to load image: ${src}`));
        }
      };

      img.src = src;
    }

    attemptLoad();
  });
}

// Check if an image URL is accessible
export async function isImageAccessible(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch (error) {
    console.warn(`Image accessibility check failed for ${url}:`, error);
    return false;
  }
}

// Preload images for better user experience
export async function preloadImages(urls: string[]): Promise<void> {
  const promises = urls.map((url) =>
    loadImageWithRetry(url, 2, 500).catch((error) => {
      console.warn(`Failed to preload image: ${url}`, error);
    })
  );

  await Promise.allSettled(promises);
}

// Image compression utility for uploads
export async function compressImageForUpload(
  file: File,
  maxWidth: number = 1920,
  maxHeight: number = 1080,
  quality: number = 0.8
): Promise<File> {
  return new Promise((resolve, reject) => {
    // Skip compression for non-image files or small files
    if (!file.type.startsWith("image/") || file.size < 5 * 1024 * 1024) {
      // 5MB threshold
      resolve(file);
      return;
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      // Calculate new dimensions while maintaining aspect ratio
      let { width, height } = img;
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width *= ratio;
        height *= ratio;
      }

      canvas.width = width;
      canvas.height = height;

      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: file.type,
                lastModified: Date.now(),
              });
              console.log(
                `Compressed image: ${file.name} (${file.size} -> ${compressedFile.size} bytes)`
              );
              resolve(compressedFile);
            } else {
              reject(new Error("Failed to compress image"));
            }
          },
          file.type,
          quality
        );
      } else {
        reject(new Error("Failed to get canvas context"));
      }
    };

    img.onerror = () =>
      reject(new Error("Failed to load image for compression"));
    img.src = URL.createObjectURL(file);
  });
}

// Validate image file before upload
export function validateImageFile(file: File): {
  valid: boolean;
  error?: string;
} {
  // Check file size (50MB limit)
  const maxSize = 50 * 1024 * 1024; // 50MB
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File size (${(file.size / (1024 * 1024)).toFixed(
        1
      )}MB) exceeds the 50MB limit`,
    };
  }

  // Check file type
  const allowedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
  ];
  if (!allowedTypes.includes(file.type.toLowerCase())) {
    return {
      valid: false,
      error: `File type ${file.type} is not supported. Please use JPEG, PNG, GIF, or WebP.`,
    };
  }

  return { valid: true };
}

// Generate unique filename for uploads
export function generateUniqueFilename(
  originalName: string,
  userId: string
): string {
  const timestamp = Date.now();
  const parts = originalName.split(".");
  const ext = parts.length > 1 ? parts.pop()!.toLowerCase() : "jpg";
  const base = parts.join(".").replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${timestamp}_${base}.${ext}`;
}
