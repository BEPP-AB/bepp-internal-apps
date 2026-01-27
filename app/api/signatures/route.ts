import { put, list, del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

interface SavedSignature {
  id: string;
  createdAt: number;
  html: string; // Store the full generated HTML signature
}

const SIGNATURES_PREFIX = "signatures/";

// POST - Save a signature
export async function POST(request: NextRequest) {
  try {
    const data: { html?: string } = await request.json();

    // Validate required fields
    if (!data.html) {
      return NextResponse.json(
        { error: "HTML signature is required" },
        { status: 400 },
      );
    }

    // Generate unique ID
    const id = `sig-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const filename = `${SIGNATURES_PREFIX}${id}.json`;

    // Create signature object with only HTML and creation date
    const signature: SavedSignature = {
      id,
      createdAt: Date.now(),
      html: data.html,
    };

    // Convert to JSON blob
    const jsonBlob = new Blob([JSON.stringify(signature)], {
      type: "application/json",
    });

    // Upload to Vercel Blob
    const blob = await put(filename, jsonBlob, {
      access: "public",
      addRandomSuffix: false,
    });

    return NextResponse.json(signature);
  } catch (error) {
    console.error("Save signature error:", error);
    return NextResponse.json(
      { error: "Failed to save signature" },
      { status: 500 },
    );
  }
}

// GET - List all signatures
export async function GET(request: NextRequest) {
  try {
    // List all files with the signatures prefix
    const { blobs } = await list({
      prefix: SIGNATURES_PREFIX,
    });

    // Fetch and parse each signature JSON file
    const signatures: (SavedSignature | null)[] = await Promise.all(
      blobs.map(async (blob) => {
        try {
          const response = await fetch(blob.url);
          const data = await response.json();
          return data as SavedSignature;
        } catch (error) {
          console.error(`Error fetching signature ${blob.url}:`, error);
          return null;
        }
      }),
    );

    // Filter out any failed fetches and sort by creation date (newest first)
    const validSignatures = signatures
      .filter((sig): sig is SavedSignature => sig !== null)
      .sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json(validSignatures);
  } catch (error) {
    console.error("List signatures error:", error);
    return NextResponse.json(
      { error: "Failed to fetch signatures" },
      { status: 500 },
    );
  }
}
