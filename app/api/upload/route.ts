import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

// Email-friendly image settings
const MAX_FILE_SIZE = 200 * 1024; // 200KB max for email compatibility

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "File must be an image" },
        { status: 400 },
      );
    }

    // Validate initial file size (max 10MB before processing)
    const maxInitialSize = 10 * 1024 * 1024;
    if (file.size > maxInitialSize) {
      return NextResponse.json(
        { error: "File size must be less than 10MB" },
        { status: 400 },
      );
    }

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Get image metadata for dimensions
    let metadata;
    try {
      metadata = await sharp(buffer).metadata();
    } catch (metadataError) {
      console.error("Metadata error:", metadataError);
      return NextResponse.json(
        { error: "Failed to read image. Please try a different image." },
        { status: 400 },
      );
    }

    const width = metadata.width || 0;
    const height = metadata.height || 0;
    const originalSize = file.size;

    // If file is already small enough, upload as-is (client already processed it)
    if (file.size <= MAX_FILE_SIZE) {
      const timestamp = Date.now();
      const filename = `signature-photos/${timestamp}.jpg`;

      const blob = await put(filename, buffer, {
        access: "public",
        addRandomSuffix: true,
        contentType: "image/jpeg",
      });

      return NextResponse.json({
        url: blob.url,
        size: file.size,
        originalSize: originalSize,
        originalWidth: width,
        originalHeight: height,
        processedWidth: width,
        processedHeight: height,
        optimized: false,
      });
    }

    // File is too large, optimize it with sharp (re-compress with mozjpeg)
    let processedImage: Buffer;
    let usedQuality = 85;
    try {
      processedImage = await sharp(buffer)
        .jpeg({
          quality: usedQuality,
          mozjpeg: true, // Use mozjpeg for better compression
        })
        .toBuffer();
    } catch (processingError) {
      console.error("Image processing error:", processingError);
      return NextResponse.json(
        { error: "Failed to optimize image. Please try a different image." },
        { status: 400 },
      );
    }

    // If still too large, try lower quality
    if (processedImage.length > MAX_FILE_SIZE) {
      usedQuality = 75;
      try {
        processedImage = await sharp(buffer)
          .jpeg({
            quality: 75,
            mozjpeg: true,
          })
          .toBuffer();
      } catch (retryError) {
        console.error("Image processing retry error:", retryError);
        return NextResponse.json(
          { error: "Image is too large after optimization. Please try a simpler image." },
          { status: 400 },
        );
      }

      // If still too large, reject
      if (processedImage.length > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: "Image is too large after optimization. Please try a smaller or simpler image." },
          { status: 400 },
        );
      }
    }

    // Generate a unique filename
    const timestamp = Date.now();
    const filename = `signature-photos/${timestamp}.jpg`;

    // Upload optimized image
    const blob = await put(filename, processedImage, {
      access: "public",
      addRandomSuffix: true,
      contentType: "image/jpeg",
    });

    return NextResponse.json({
      url: blob.url,
      size: processedImage.length,
      originalSize: originalSize,
      originalWidth: width,
      originalHeight: height,
      processedWidth: width, // Dimensions unchanged, only compression optimized
      processedHeight: height,
      optimized: true,
      quality: usedQuality,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 },
    );
  }
}
