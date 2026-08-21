import fs from 'fs';
import pg from 'pg';

const client = new pg.Client({
    connectionString: process.env.DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function runHarness() {
    console.log('Starting Clinic Block 3 TS Executable Harness...');
    await client.connect();

    client.on('notice', (msg) => {
        if (msg && msg.message) {
            console.log(msg.message);
        }
    });

    try {
        const sql = fs.readFileSync('supabase/tests/clinic_workspace_authority_hardening_tests.sql', 'utf8');
        await client.query(sql);
        console.log('CLINIC_BLOCK3_TS_HARNESS_COMPLETED=YES');
    } catch (err: any) {
        console.error('CLINIC_BLOCK3_TS_HARNESS_ERROR:', err.message);
        if (err.detail) console.error('DETAIL:', err.detail);
        if (err.hint) console.error('HINT:', err.hint);
        if (err.where) console.error('WHERE:', err.where);
        process.exit(1);
    } finally {
        await client.end();
    }
}

runHarness();
