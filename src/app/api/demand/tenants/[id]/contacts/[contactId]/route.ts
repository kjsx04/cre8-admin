import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { asString, DemandError, UUID_RE } from "@/lib/demand/coerce";
import { jsonError, readJson } from "@/lib/demand/http";
import { deleteContact, updateContact, type ContactWrite } from "@/lib/demand/service";
import type { ContactType } from "@/lib/demand/types";

function contactWrite(body: Record<string, unknown>): ContactWrite {
  const type = asString(body.contactType);
  const contactType: ContactType = type === "in_house" ? "in_house" : "broker";
  return {
    contactType,
    name: asString(body.name) || "",
    company: asString(body.company),
    title: asString(body.title),
    email: asString(body.email),
    phone: asString(body.phone),
  };
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string; contactId: string } }) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  if (!UUID_RE.test(params.id) || !UUID_RE.test(params.contactId)) return jsonError(new DemandError("Unknown contact.", 400));
  try {
    const contact = await updateContact(params.id, params.contactId, contactWrite(await readJson(request)));
    return NextResponse.json(contact);
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string; contactId: string } }) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  if (!UUID_RE.test(params.id) || !UUID_RE.test(params.contactId)) return jsonError(new DemandError("Unknown contact.", 400));
  try {
    await deleteContact(params.id, params.contactId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
