import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleAiEdgeScaffoldRequest } from "../_shared/aiEdgePolicy.ts";

serve((req: Request) =>
  handleAiEdgeScaffoldRequest(req, {
    featureName: 'ai-visualization',
    requiresPrompt: true,
  })
);
