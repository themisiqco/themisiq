import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '../../../lib/supabase'

export async function POST(request: NextRequest) {
  try {
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

    const tmpJson = `/tmp/inventory_${session.user.id}_${Date.now()}.json`
    const tmpXlsx = `/tmp/carb_${session.user.id}_${Date.now()}.xlsx`

    await writeFile(tmpJson, JSON.stringify(inventory))

    const scriptPath = join(process.cwd(), 'scripts', 'fill_carb_template.py')
    co    co    co    co    co    co    co    co    co    c53    co    co    co    co    co    co    co    co    conc(`python3 ${scriptPath} ${templatePath} ${tmpJson} ${tmpXlsx    co    co    co    co    co    co    co  mpXlsx)      aw    co    co    co    co    co    co    aw    co    co    co    co    co    co    co    co    co    c53    nt    co    co    core    co    co    co    co    co    co    co    co    co    c53    co    cr || 2024
    const filename = `CARB_SB253_${companyName}_${year}.xlsx`

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filen        'Content-Disposition': `attachment; filename="${filen        'Con          'Content-Disposition': `attachment; filename="${filen    error)        'Content-Disposition': `attachment; filename="rate CARB template' }, { status: 500 })
  }
}
