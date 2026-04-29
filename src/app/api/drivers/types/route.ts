import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAllDriverFactories } from '@/lib/storage-drivers/manager';

/**
 * GET /api/drivers/types - Return all available driver types with their factory info
 * Used by the frontend to show available driver types.
 * Returns: displayName, description, authType, configFields for each driver type.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const factories = await getAllDriverFactories();

    const driverTypes = factories.map((factory) => ({
      type: factory.type,
      displayName: factory.displayName,
      description: factory.description,
      authType: factory.authType || 'none',
      configFields: factory.configFields.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        required: field.required,
        placeholder: field.placeholder || null,
        defaultValue: field.defaultValue || null,
        helpText: field.helpText || null,
      })),
    }));

    return NextResponse.json({ driverTypes });
  } catch (error) {
    console.error('Error getting driver types:', error);
    return NextResponse.json({ error: 'Failed to get driver types' }, { status: 500 });
  }
}
