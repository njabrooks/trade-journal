import { NextRequest, NextResponse } from "next/server";

// For now, we'll just validate and return success
// In the future, we can store these in a database table
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      dteThreshold,
      assignmentDteThreshold,
      sizeAttentionThreshold,
      sizeUrgentThreshold,
      complexityThreshold,
    } = body;

    // Validate inputs
    if (
      typeof dteThreshold !== "number" ||
      typeof assignmentDteThreshold !== "number" ||
      typeof sizeAttentionThreshold !== "number" ||
      typeof sizeUrgentThreshold !== "number" ||
      typeof complexityThreshold !== "number"
    ) {
      return NextResponse.json({ error: "All thresholds must be numbers" }, { status: 400 });
    }

    if (dteThreshold < 0 || dteThreshold > 365) {
      return NextResponse.json({ error: "DTE threshold must be between 0 and 365" }, { status: 400 });
    }

    if (assignmentDteThreshold < 0 || assignmentDteThreshold > 30) {
      return NextResponse.json(
        { error: "Assignment DTE threshold must be between 0 and 30" },
        { status: 400 }
      );
    }

    if (sizeAttentionThreshold < 0 || sizeAttentionThreshold > 1) {
      return NextResponse.json(
        { error: "Size attention threshold must be between 0 and 1" },
        { status: 400 }
      );
    }

    if (sizeUrgentThreshold < 0 || sizeUrgentThreshold > 1) {
      return NextResponse.json(
        { error: "Size urgent threshold must be between 0 and 1" },
        { status: 400 }
      );
    }

    if (sizeUrgentThreshold <= sizeAttentionThreshold) {
      return NextResponse.json(
        { error: "Size urgent threshold must be greater than attention threshold" },
        { status: 400 }
      );
    }

    if (complexityThreshold < 1 || complexityThreshold > 100) {
      return NextResponse.json(
        { error: "Complexity threshold must be between 1 and 100" },
        { status: 400 }
      );
    }

    // TODO: Store in database table `triage_rules` or similar
    // For now, we'll just return success
    // The actual rules are still read from the code in `src/lib/derived/triage.ts`

    return NextResponse.json({
      success: true,
      message: "Rules validated (storage not yet implemented)",
    });
  } catch (error) {
    console.error("Error saving triage rules:", error);
    return NextResponse.json(
      {
        error: "Failed to save rules",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

