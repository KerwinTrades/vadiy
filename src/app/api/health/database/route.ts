import { NextRequest, NextResponse } from 'next/server';
import { AirtableService } from '@/lib/airtable';

export async function GET(request: NextRequest) {
  try {
    // Test basic environment variables
    const airtableToken = process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
    const baseId = process.env.AIRTABLE_BASE_ID;
    
    if (!airtableToken || !baseId) {
      return NextResponse.json({
        success: false,
        error: 'Missing Airtable configuration',
        details: {
          hasToken: !!airtableToken,
          hasBaseId: !!baseId
        }
      }, { status: 500 });
    }

    // Test Airtable connectivity and get table status
    console.log('🔍 Running comprehensive table detection...');
    
    const [tableConnections, availableTables] = await Promise.all([
      AirtableService.testConnection(),
      AirtableService.listAllTablesInBase()
    ]);

    const accessibleCount = Object.values(tableConnections).filter(Boolean).length;
    const totalCount = Object.keys(tableConnections).length;

    return NextResponse.json({
      success: true,
      message: 'Database health check completed',
      timestamp: new Date().toISOString(),
      data: {
        environment: {
          hasToken: !!airtableToken,
          hasBaseId: !!baseId,
          baseId: baseId
        },
        tables: {
          accessible: accessibleCount,
          total: totalCount,
          status: tableConnections,
          discovered: availableTables
        },
        summary: {
          connectionHealthy: accessibleCount > 0,
          coreTablesFound: !!(tableConnections['User Profiles'] || tableConnections['Opportunities'] || tableConnections['Resources']),
          percentageAccessible: Math.round((accessibleCount / totalCount) * 100)
        }
      }
    });

  } catch (error) {
    console.error('Database health check error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Database health check failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 