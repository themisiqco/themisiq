export const runtime = "nodejs"
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { createServerClient } = await import('../../../lib/supabase')
    const supabase = createServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const inventory = await request.json()
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const { readFile, writeFile, unlink } = await import('fs/promises')
    const { join } = await import('path')
    const execAsync = promisify(exec)
    const uid = session.user.id
    const ts = Date.now()
    const tmpJson = `/tmp/inv_${uid}_${ts}.json`
    const tmpXlsx = `/tmp/carb_${uid}_${ts}.xlsx`
    await writeFile(tmpJson, JSON.stringify(inventory))
    const script = join(process.cwd(), 'scripts', 'fill_carb_template.py')
    const template = join(process.cwd(), 'public', 'SB253_Draft_Scope1_2_GHG_Template.xlsx')
    await execAsync(`python3 ${script} ${template} ${tmpJson} ${tmpXlsx}`)
    const fileBuffer = await readFile(tmpXlsx)
    await unlink(tmpJson).catch(() => {})
    await unlink(tmpXlsx).catch(() => {})
    const name = (inventory.company_name || 'Company').replace(/\s+/g, '_')
    const year = inventory.reporting_year || 2024
    const filename = `CARB_SB253_${name}_${year}.xlsx`
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