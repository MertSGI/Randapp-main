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
        // Node pg client doesn't process multiple statements properly with notices in a single client.query string if an exception is thrown inside a DO block.
        // We execute statements section by section or line block by line block.
        const statements = sql
            .split(/;\s*$/m)
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

        for (const stmt of statements) {
            if (stmt === 'BEGIN' || stmt === 'ROLLBACK' || stmt === 'COMMIT') continue;
            try {
                await client.query(stmt);
            } catch (err: any) {
                console.error('STATEMENT ERROR in:', stmt.slice(0, 80));
                console.error('MESSAGE:', err.message);
                if (err.detail) console.error('DETAIL:', err.detail);
                if (err.hint) console.error('HINT:', err.hint);
                if (err.where) console.error('WHERE:', err.where);
                throw err;
            }
        }
        console.log('CLINIC_BLOCK3_TS_HARNESS_COMPLETED=YES');
    } catch (err: any) {
        process.exit(1);
    } finally {
        await client.end();
    }
}

runHarness();
