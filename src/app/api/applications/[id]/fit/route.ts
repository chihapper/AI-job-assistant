import { errorResponse, requireApiAuth } from "@/lib/api";
import { recomputeFit } from "@/lib/services";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const { id } = await params;
    const fit = await recomputeFit(id);
    return Response.json({ overall: fit.overall, score: fit.score ?? null, summary: fit.summary });
  } catch (err) {
    return errorResponse(err);
  }
}
