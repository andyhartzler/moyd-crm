module.exports = [
"[project]/.next-internal/server/app/messenger/route/actions.js [app-rsc] (server actions loader, ecmascript)", ((__turbopack_context__, module, exports) => {

}),
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/action-async-storage.external.js [external] (next/dist/server/app-render/action-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/action-async-storage.external.js", () => require("next/dist/server/app-render/action-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/stream [external] (stream, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("stream", () => require("stream"));

module.exports = mod;
}),
"[externals]/http [external] (http, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("http", () => require("http"));

module.exports = mod;
}),
"[externals]/url [external] (url, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("url", () => require("url"));

module.exports = mod;
}),
"[externals]/punycode [external] (punycode, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("punycode", () => require("punycode"));

module.exports = mod;
}),
"[externals]/https [external] (https, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("https", () => require("https"));

module.exports = mod;
}),
"[externals]/zlib [external] (zlib, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("zlib", () => require("zlib"));

module.exports = mod;
}),
"[project]/src/app/messenger/route.js [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "POST",
    ()=>POST
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
;
const BB_HOST = ("TURBOPACK compile-time value", "https://messages.moydchat.org");
const BB_PASSWORD = ("TURBOPACK compile-time value", "fucktrump");
async function POST(request) {
    try {
        const body = await request.json();
        const { phone, message, memberId } = body;
        if (!phone || !message) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: 'Phone and message are required'
            }, {
                status: 400
            });
        }
        // Format the chatGuid properly for iMessage
        // For phone numbers, use: iMessage;-;+15735551234
        const chatGuid = phone.includes(';') ? phone : `iMessage;-;${phone}`;
        // Send message via BlueBubbles REST API
        // Documentation: https://docs.bluebubbles.app/server/developer-guides/rest-api-and-webhooks
        const response = await fetch(`${BB_HOST}/api/v1/message/text?password=${BB_PASSWORD}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chatGuid: chatGuid,
                text: message,
                method: 'private-api'
            })
        });
        // BlueBubbles returns JSON with this format:
        // { status: number, message: string, data?: any, error?: { type: string, error: string } }
        const result = await response.json();
        if (!response.ok || result.status !== 200) {
            console.error('BlueBubbles API error:', result);
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: result.error?.error || result.message || 'Failed to send message',
                details: result
            }, {
                status: response.status || 500
            });
        }
        // Success! Now create/update the conversation and message in Supabase
        if (memberId) {
            try {
                const { createClient } = __turbopack_context__.r("[project]/node_modules/@supabase/supabase-js/dist/module/index.js [app-route] (ecmascript)");
                const supabase = createClient(("TURBOPACK compile-time value", "https://faajpcarasilbfndzkmd.supabase.co"), ("TURBOPACK compile-time value", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhYWpwY2FyYXNpbGJmbmR6a21kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAyMTcxOTksImV4cCI6MjA3NTc5MzE5OX0.KsOsdwE8Bl4CcHIdYzNmOrDOs_ajle9s7DY4lfXzWFA"));
                // Try to find existing conversation
                const { data: existingConv } = await supabase.from('conversations').select('id').eq('member_id', memberId).single();
                let conversationId = existingConv?.id;
                // Create conversation if it doesn't exist
                if (!conversationId) {
                    const { data: newConv, error: convError } = await supabase.from('conversations').insert({
                        member_id: memberId,
                        chat_identifier: chatGuid,
                        status: 'active',
                        last_message_at: new Date().toISOString()
                    }).select('id').single();
                    if (convError) {
                        console.error('Error creating conversation:', convError);
                    } else {
                        conversationId = newConv.id;
                    }
                } else {
                    // Update last_message_at
                    await supabase.from('conversations').update({
                        last_message_at: new Date().toISOString()
                    }).eq('id', conversationId);
                }
                // Create message record
                if (conversationId) {
                    await supabase.from('messages').insert({
                        conversation_id: conversationId,
                        body: message,
                        direction: 'outbound',
                        delivery_status: 'sent',
                        sender_phone: phone,
                        guid: result.data?.guid || `temp_${Date.now()}`
                    });
                }
            } catch (dbError) {
                console.error('Database error:', dbError);
            // Don't fail the whole request if DB update fails
            }
        }
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            success: true,
            data: result.data,
            message: 'Message sent successfully'
        });
    } catch (error) {
        console.error('Error in send-message API:', error);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: error.message || 'Internal server error'
        }, {
            status: 500
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__5bb51177._.js.map