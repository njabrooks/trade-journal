import { NextRequest, NextResponse } from 'next/server';
import {
  createMonitoringSpec,
  getMonitoringSpecsByThesis,
  getMonitoringSpecsByValidationPoint,
  getLatestMonitoringEvent,
} from '@/db/queries/monitoring';
import { getValidationPointById } from '@/db/queries/thesisSynthesis';
import { validateMonitoringSpec } from '@/lib/services/monitoring';

/**
 * GET /api/monitoring/specs
 * List monitoring specs for a thesis or validation point
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const thesisId = searchParams.get('thesisId');
    const thesisType = searchParams.get('thesisType') as 'macro' | 'asset' | null;
    const validationPointId = searchParams.get('validationPointId');

    if (validationPointId) {
      // Get specs for a specific validation point
      const specs = await getMonitoringSpecsByValidationPoint(validationPointId);

      // Enrich with last check event
      const enriched = await Promise.all(
        specs.map(async (spec) => {
          const lastCheckEvent = await getLatestMonitoringEvent(spec.id);
          return {
            ...spec,
            lastCheckEvent: lastCheckEvent || null,
          };
        })
      );

      return NextResponse.json({ specs: enriched });
    } else if (thesisId && thesisType) {
      // Get specs for a thesis
      const specsWithPoints = await getMonitoringSpecsByThesis(thesisId, thesisType);

      // Enrich with last check event
      const enriched = await Promise.all(
        specsWithPoints.map(async ({ spec, validationPoint }) => {
          const lastCheckEvent = await getLatestMonitoringEvent(spec.id);
          return {
            spec: {
              ...spec,
              lastCheckEvent: lastCheckEvent || null,
            },
            validationPoint,
          };
        })
      );

      return NextResponse.json({ specs: enriched });
    } else {
      return NextResponse.json(
        { error: 'Either thesisId+thesisType or validationPointId is required' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error fetching monitoring specs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch monitoring specs' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/monitoring/specs
 * Create a new monitoring spec
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      validationPointId,
      keywords,
      semanticDescription,
      sources,
      exclusions,
      frequency,
      alertThreshold,
      enabled,
    } = body;

    // Validate validation point exists
    const validationPoint = await getValidationPointById(validationPointId);
    if (!validationPoint) {
      return NextResponse.json({ error: 'Validation point not found' }, { status: 404 });
    }

    // Validate spec data
    const validation = validateMonitoringSpec({
      validationPointId,
      keywords,
      sources,
      frequency,
      alertThreshold,
    });

    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Invalid monitoring spec', details: validation.errors },
        { status: 400 }
      );
    }

    // Create spec
    const spec = await createMonitoringSpec({
      validationPointId,
      keywords,
      semanticDescription,
      sources,
      exclusions,
      frequency,
      alertThreshold,
      enabled,
    });

    return NextResponse.json({ success: true, spec }, { status: 201 });
  } catch (error) {
    console.error('Error creating monitoring spec:', error);
    return NextResponse.json(
      {
        error: 'Failed to create monitoring spec',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
