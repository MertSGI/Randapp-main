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
        const rawSql = fs.readFileSync('supabase/tests/clinic_workspace_authority_hardening_tests.sql', 'utf8');
        // Clean out comments and split into discrete SQL statements / DO blocks
        const blocks = rawSql
            .split(/(?=DO \$\$|SELECT set_config|BEGIN;|ROLLBACK;)/i)
            .map(b => b.trim())
            .filter(b => b.length > 0 && !b.startsWith('--'));

        for (const block of blocks) {
            try {
                await client.query(block);
            } catch (err: any) {
                console.error('================ STATEMENT ERROR ================');
                console.error('BLOCK SNIPPET:', block.slice(0, 150));
                console.error('ERROR MESSAGE:', err.message);
                if (err.detail) console.error('DETAIL:', err.detail);
                if (err.hint) console.error('HINT:', err.hint);
                if (err.where) console.error('WHERE:', err.where);
                console.error('=================================================');
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
