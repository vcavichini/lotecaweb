import { NextResponse } from "next/server";

import { fetchContestData } from "@/lib/lottery";
import { getErrorMessage } from "@/lib/validation";

export async function GET() {
  try {
    const data = await fetchContestData("");
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 503 });
  }
}
