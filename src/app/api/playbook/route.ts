import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { playbookItems, NewPlaybookItem } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const strategyType = searchParams.get('strategyType') || undefined;
    const category = searchParams.get('category') || undefined;
    const id = searchParams.get('id') || undefined;

    if (id) {
      const rows = await db
        .select()
        .from(playbookItems)
        .where(eq(playbookItems.id, id))
        .limit(1);
      if (rows.length === 0) {
        return NextResponse.json({ error: 'Playbook item not found' }, { status: 404 });
      }
      return NextResponse.json(rows[0]);
    }

    let query = db.select().from(playbookItems);

    if (strategyType) {
      query = query.where(eq(playbookItems.strategyType, strategyType)) as any;
    }
    if (category) {
      query = query.where(eq(playbookItems.category, category)) as any;
    }

    const rows = await query.orderBy(playbookItems.strategyType, playbookItems.code);

    return NextResponse.json(rows);
  } catch (error) {
    console.error('Error fetching playbook items:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch playbook items',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      code,
      label,
      description,
      category,
      strategyType,
      criteria,
      appliesToContext,
      checklistItems,
      linkedTriageRuleSet,
      defaultSeverity,
      strategyTemplateId,
    } = body;

    if (!code || !label || !category || !strategyType) {
      return NextResponse.json(
        { error: 'code, label, category, and strategyType are required' },
        { status: 400 }
      );
    }

    const newItem: NewPlaybookItem = {
      code,
      label,
      description: description || null,
      category,
      strategyType,
      criteria: criteria || null,
      appliesToContext: appliesToContext || 'strategy',
      checklistItems: checklistItems || null,
      linkedTriageRuleSet: linkedTriageRuleSet || null,
      defaultSeverity: defaultSeverity || null,
      strategyTemplateId: strategyTemplateId || null,
      isActive: true,
    };

    const [inserted] = await db.insert(playbookItems).values(newItem).returning();

    return NextResponse.json({
      success: true,
      id: inserted.id,
      message: 'Playbook item created successfully',
    });
  } catch (error) {
    console.error('Error creating playbook item:', error);
    return NextResponse.json(
      {
        error: 'Failed to create playbook item',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (updates.code !== undefined) updateData.code = updates.code;
    if (updates.label !== undefined) updateData.label = updates.label;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.category !== undefined) updateData.category = updates.category;
    if (updates.strategyType !== undefined) updateData.strategyType = updates.strategyType;
    if (updates.criteria !== undefined) updateData.criteria = updates.criteria;
    if (updates.appliesToContext !== undefined) updateData.appliesToContext = updates.appliesToContext;
    if (updates.checklistItems !== undefined) updateData.checklistItems = updates.checklistItems;
    if (updates.linkedTriageRuleSet !== undefined) updateData.linkedTriageRuleSet = updates.linkedTriageRuleSet;
    if (updates.defaultSeverity !== undefined) updateData.defaultSeverity = updates.defaultSeverity;
    if (updates.strategyTemplateId !== undefined) updateData.strategyTemplateId = updates.strategyTemplateId;
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive;

    await db.update(playbookItems).set(updateData).where(eq(playbookItems.id, id));

    return NextResponse.json({
      success: true,
      message: 'Playbook item updated successfully',
    });
  } catch (error) {
    console.error('Error updating playbook item:', error);
    return NextResponse.json(
      {
        error: 'Failed to update playbook item',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // Soft delete by setting isActive to false
    await db
      .update(playbookItems)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(playbookItems.id, id));

    return NextResponse.json({
      success: true,
      message: 'Playbook item deactivated successfully',
    });
  } catch (error) {
    console.error('Error deleting playbook item:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete playbook item',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

