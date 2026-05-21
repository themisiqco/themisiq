import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '../../../../lib/supabase'

export async function POST(request: NextRequest) {
  try {
    // Verify authenticated user
    const supabase = createServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const inventory = await request.json()

    // Call Python script to fill the official CARB template
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const { readFile, writeFile, unlink } = await import('fs/promises')
    const { join } = await import('path')
    const execAsync = promisify(exec)

    // Write inventory data to temp JSON file
    const tmpJson = `/tmp/inventory_${session.user.id}_${Date.now()}.json`
    const tmpXlsx = `/tmp/carb_${session.user.id}_${Date.now()}.xlsx`

    await writeFile(tmpJson, JSON.stringify(inventory))

    // Run Python filler script
    const scriptPath = join(process.cwd(), 'scripts', 'fill_carb_template.py')
    const templatePath = join(process.cwd(), 'public', 'SB253_Draft_Scope1_2_GHG_Template.xlsx')

    await execAsync(`python3 ${scriptPath} ${templatePath} ${tmpJson} ${tmpXlsx}`)

    // Read the filled template
    const fileBuffer = await readFile(tmpXlsx)

    // Clean up temp files
    await unlink(tmpJson).catch(() => {})
    await unlink(tmpXlsx).catch(() => {})

    const companyName = inventory.company_name?.replace(/\s+/g, '_') || 'Company'
    const year = inventory.reporting_year || 2024
    const filename = `ThemisIQ_CARB_SB253_${companyName}_${year}.xlsx`

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('CARB export error:', error)
    return NextResponse.json({ error: 'Failed to generate CARB template' }, { status: 500 })
  }
}
