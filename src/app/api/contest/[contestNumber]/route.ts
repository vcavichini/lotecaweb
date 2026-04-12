import { NextResponse } from "next/server";

import { fetchContestData } from "@/lib/lottery";
import { getErrorMessage } from "@/lib/validation";

type Params = {
  params: Promise<{ contestNumber: string }>;
};

export async function GET(_: Request, { params }: Params) {
  try {
    const { contestNumber } = await params;
    const data = await fetchContestData(contestNumber);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}
