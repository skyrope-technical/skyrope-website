/**
 * Sky Rope — Cloudflare Worker entry point
 * Handles /api/contact, delegates everything else to static assets.
 */

import { onRequestPost, onRequestOptions } from './functions/api/contact.js';

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // Route /api/contact to the contact handler
        if (url.pathname === '/api/contact') {
            if (request.method === 'POST')    return onRequestPost({ request, env });
            if (request.method === 'OPTIONS') return onRequestOptions();
            return new Response(
                JSON.stringify({ error: `Method ${request.method} not allowed` }),
                { status: 405, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // Everything else → serve static assets
        return env.ASSETS.fetch(request);
    }
};
