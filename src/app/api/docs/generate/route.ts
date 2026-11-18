import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { DocxGenerateError, generateDocxBuffer } from "@/lib/generate-docx";

export async function POST(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    const output = generateDocxBuffer(body);

    return new NextResponse(new Uint8Array(output), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${body.docType}_document.docx"`,
      },
    });
  } catch (error) {
    console.error("Generation error:", error);
    if (error instanceof DocxGenerateError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Document generation failed",
      },
      { status: 500 }
    );
  }
}
