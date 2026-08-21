import fs from 'fs';
import pg from 'pg';

const client = new pg.Client({
    connectionString: process.env.DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function runHarness() {
    let fullLog = 'Starting Clinic Block 3 TS Executable Harness...\n';
    console.log('Starting Clinic Block 3 TS Executable Harness...');
    await client.connect();

    client.on('notice', (msg) => {
        if (msg && msg.message) {
            fullLog += msg.message + '\n';
            console.log(msg.message);
        }
    });

    try {
        const rawSql = fs.readFileSync('supabase/tests/clinic_workspace_authority_hardening_tests.sql', 'utf8');
        const blocks = rawSql
            .split(/(?=DO \$\$|SELECT set_config|BEGIN;|ROLLBACK;)/i)
            .map(b => b.trim())
            .filter(b => b.length > 0 && !b.startsWith('--'));

        for (const block of blocks) {
            try {
                await client.query(block);
            } catch (err: any) {
                const errLog = '=== STATEMENT ERROR ===\nBLOCK SNIPPET: ' + block.slice(0, 120) + '\nMESSAGE: ' + err.message + '\nDETAIL: ' + (err.detail || '') + '\nHINT: ' + (err.hint || '') + '\nWHERE: ' + (err.where || '') + '\n=======================\n';
                fullLog += errLog;
                console.error(errLog);
                fs.writeFileSync('/tmp/clinic-block3-sql.log', fullLog);
                process.exit(1);
            }
        }
        fullLog += 'CLINIC_BLOCK3_TS_HARNESS_COMPLETED=YES\n';
        fs.writeFileSync('/tmp/clinic-block3-sql.log', fullLog);
        console.log('CLINIC_BLOCK3_TS_HARNESS_COMPLETED=YES');
    } catch (err: any) {
        fs.writeFileSync('/tmp/clinic-block3-sql.log', fullLog);
        process.exit(1);
    } finally {
        await client.end();
    }
}

runHarness();
