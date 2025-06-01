import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';

// Initialize Airtable
const airtableConfig: any = {
  apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN || process.env.AIRTABLE_API_KEY
};

if (process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN) {
  airtableConfig.endpointUrl = 'https://api.airtable.com';
}

// Force correct base ID (removing any extra characters)
const correctBaseId = 'appIt79pA48YDZHcI';
const providedTableId = 'tbl3ZNNQMUZilr08V';

const base = new Airtable(airtableConfig).base(correctBaseId);

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 TESTING CORRECTED AIRTABLE ACCESS...');
    console.log('Corrected Base ID:', correctBaseId);
    console.log('Provided Table ID:', providedTableId);
    console.log('Auth Method:', process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN ? 'Personal Access Token' : 'API Key');

    const results = {
      foundTables: [] as any[],
      directTableTest: null as any,
      errors: [] as any[]
    };

    // Test direct table access with provided table ID
    try {
      console.log(`🎯 Testing direct table ID: ${providedTableId}`);
      const records = await base(providedTableId).select({ maxRecords: 3 }).all();
      
      results.directTableTest = {
        tableId: providedTableId,
        recordCount: records.length,
        success: true,
        sampleFields: records.length > 0 ? Object.keys(records[0].fields) : [],
        sampleRecord: records.length > 0 ? records[0].fields : null
      };
      
      console.log(`✅ SUCCESS! Table ${providedTableId} found with ${records.length} records`);
      if (records.length > 0) {
        console.log(`📋 Field names:`, Object.keys(records[0].fields));
        console.log(`📋 Sample record:`, records[0].fields);
      }
      
    } catch (error: any) {
      console.log(`❌ Failed to access table ${providedTableId}:`, error.message);
      results.errors.push({
        tableId: providedTableId,
        error: error.message
      });
    }

    // Test common table names with corrected base
    const testTableNames = [
      'opportunities', 'Opportunities', 'OPPORTUNITIES',
      'Table 1', 'Table 2', 'Sheet1', 'Main'
    ];

    for (const tableName of testTableNames) {
      try {
        console.log(`Testing table name: "${tableName}"`);
        const records = await base(tableName).select({ maxRecords: 1 }).firstPage();
        
        results.foundTables.push({
          name: tableName,
          recordCount: records.length,
          sampleFields: records.length > 0 ? Object.keys(records[0].fields).slice(0, 5) : []
        });
        
        console.log(`✅ Found table: "${tableName}" - ${records.length} records`);
        
      } catch (error: any) {
        if (!error.message?.includes('NOT_FOUND')) {
          results.errors.push({
            name: tableName,
            error: error.message
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Tested table access with corrected base ID`,
      data: {
        correctedBaseId: correctBaseId,
        originalEnvBaseId: process.env.AIRTABLE_BASE_ID,
        authMethod: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN ? 'Personal Access Token' : 'API Key',
        ...results,
        summary: {
          directTableSuccess: results.directTableTest?.success || false,
          foundTableCount: results.foundTables.length,
          hasErrors: results.errors.length > 0
        }
      }
    });

  } catch (error) {
    console.error('❌ Test failed:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to test table access',
      details: error instanceof Error ? error.message : 'Unknown error',
      data: {
        correctedBaseId: correctBaseId,
        originalEnvBaseId: process.env.AIRTABLE_BASE_ID,
        authMethod: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN ? 'Personal Access Token' : 'API Key'
      }
    }, { status: 500 });
  }
} 