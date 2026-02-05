import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    const expectedPassword = process.env.PAGE_PASSWORD;

    if (!expectedPassword) {
      return NextResponse.json(
        { error: "Password protection not configured" },
        { status: 500 }
      );
    }

    if (password === expectedPassword) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to verify password" },
      { status: 500 }
    );
  }
}
