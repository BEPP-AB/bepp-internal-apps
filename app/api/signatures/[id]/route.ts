import { list, del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

const SIGNATURES_PREFIX = "signatures/";

// DELETE - Delete a signature
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const { id } = await Promise.resolve(params);

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    // List all signatures to find the one with matching ID
    const { blobs } = await list({
      prefix: SIGNATURES_PREFIX,
    });

    // Find the blob that matches this signature ID
    // The filename format is: signatures/{id}.json
    const expectedFilename = `${SIGNATURES_PREFIX}${id}.json`;
    const blobToDelete = blobs.find(
      (blob) =>
        blob.pathname === expectedFilename ||
        blob.pathname.endsWith(`/${id}.json`),
    );

    if (!blobToDelete) {
      return NextResponse.json(
        { error: "Signature not found" },
        { status: 404 },
      );
    }

    // Delete the blob
    await del(blobToDelete.url);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete signature error:", error);
    return NextResponse.json(
      { error: "Failed to delete signature" },
      { status: 500 },
    );
  }
}
