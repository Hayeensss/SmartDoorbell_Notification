import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { createClerkClient } from "@clerk/backend";

// Event template configuration
const EVENT_TEMPLATES = {
  button_pressed: {
    subject: 'Doorbell Alert',
    intro: 'Someone is at your doorbell',
    details: (location) => `Your doorbell was activated${location ? ` at ${location}` : ''}`,
    icon: '🚪',
    priority: 'high',
  },
  motion_detected: {
    subject: 'Motion Alert',
    intro: 'Motion was detected',
    details: (location) => `Motion was detected${location ? ` at ${location}` : ''}`,
    icon: '👥',
    priority: 'medium',
  },
  package_detected: {
    subject: 'Package Alert',
    intro: 'A package was detected',
    details: (location) => `A package was detected${location ? ` at ${location}` : ''}`,
    icon: '📦',
    priority: 'medium',
  },
  person_detected: {
    subject: 'Person Alert',
    intro: 'A person was detected',
    details: (location) => `A person was detected${location ? ` at ${location}` : ''}`,
    icon: '🧍',
    priority: 'medium',
  },
  doorbell_offline: {
    subject: 'Device Offline',
    intro: 'A device is offline',
    details: (location) => `Your device lost connection${location ? ` at ${location}` : ''}`,
    icon: '⚠️',
    priority: 'low',
  },
  sound_detected: {
    subject: 'Sound Alert',
    intro: 'A sound was detected',
    details: (location) => `A sound was detected${location ? ` at ${location}` : ''}`,
    icon: '🔊',
    priority: 'medium',
  },
  battery_low: {
    subject: 'Battery Low',
    intro: 'Device battery is low',
    details: (location) => `Your device needs charging${location ? ` at ${location}` : ''}`,
    icon: '🔋',
    priority: 'medium',
  },
};

// Default template for unknown event types
const DEFAULT_TEMPLATE = {
  subject: 'Smart Home Alert',
  intro: 'New alert from your device',
  details: (location) => `An event was detected${location ? ` at ${location}` : ''}`,
  icon: '🏠',
  priority: 'medium',
};

/**
 * Fetch user details from Clerk
 */
async function getUserDetailsFromClerk(userId, clerkClient) {
  if (!userId) {
    console.warn('getUserDetailsFromClerk called with no userId');
    return { firstName: null, email: null };
  }
  try {
    const user = await clerkClient.users.getUser(userId);
    const primaryEmail = user.emailAddresses.find(
      (e) => e.id === user.primaryEmailAddressId
    );
    return {
      firstName: user.firstName,
      email: primaryEmail?.emailAddress || null,
    };
  } catch (error) {
    console.error(`Error fetching user ${userId} from Clerk:`, error.message);
    if (error.status === 404) {
      console.warn(`User ${userId} not found in Clerk.`);
    }
    return { firstName: null, email: null };
  }
}

/**
 * Generate the HTML email content for an event
 */
function generateEmailContent(event, userInfo) {
  const {
    event_type,
    device_name,
    device_location,
    payload,
    occurred_at,
  } = event;

  const safePayload = payload || {};
  const media_url = safePayload.media_url;
  const media_transcript = safePayload.media_transcript;
  const additionalInfo = safePayload.message || '';

  const template = EVENT_TEMPLATES[event_type] || DEFAULT_TEMPLATE;
  const date = new Date(occurred_at).toLocaleString();

  const subject = `${template.icon} ${template.subject}: ${device_name}`;
  const intro = `${template.intro}!`;
  const details = template.details(device_location);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; color: #333; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #ffffff; }
    .header { background-color: ${template.priority === 'high' ? '#ff4444' : template.priority === 'medium' ? '#4a90e2' : '#666666'}; padding: 20px; color: white; border-radius: 8px 8px 0 0; }
    .content { padding: 30px; background: #f9f9f9; border: 1px solid #eee; border-top: none; border-radius: 0 0 8px 8px; }
    .event-icon { font-size: 2em; margin-bottom: 10px; }
    .event-time { color: #666; font-size: 0.9em; margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; }
    .media-section { margin-top: 20px; padding: 15px; background: #fff; border: 1px solid #eee; border-radius: 4px; }
    .transcript { margin-top: 10px; padding: 10px; background: #f5f5f5; border-radius: 4px; font-style: italic; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; margin-top: 20px; }
    @media only screen and (max-width: 480px) { .container { padding: 10px; } .header, .content { padding: 15px; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="event-icon">${template.icon}</div>
      <h1>${subject}</h1>
    </div>
    <div class="content">
      <p>Hi ${userInfo.firstName || 'there'},</p>
      <p><strong>${intro}</strong></p>
      <p>${details}</p>
      ${additionalInfo ? `<p>${additionalInfo}</p>` : ''}
      ${media_url ? `
      <div class="media-section">
        <p><strong>Media Available:</strong> <a href="${media_url}">View Recording</a></p>
        ${media_transcript ? `
          <div class="transcript">
            <p><strong>Transcript:</strong></p>
            <p>${media_transcript}</p>
          </div>
        ` : ''}
      </div>
      ` : ''}
      <div class="event-time">
        <p>Event Time: ${date}</p>
        <p>Device: ${device_name}${device_location ? ` (${device_location})` : ''}</p>
      </div>
    </div>
    <div class="footer">
      <p>This is an automated message from your Smart Doorbell system.</p>
      <p>Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`;

  return { subject, html };
}

/**
 * Process pending events via Supabase
 */
async function processEvents(supabase, resend, clerkClient) {
  let processed = 0, successful = 0, failed = 0;
  console.log('Fetching unsent events from Supabase...');
  const { data: events, error: fetchError } = await supabase
    .from('events')
    .select('event_id, device_id, event_type, payload, occurred_at')
    .eq('send_email', false)
    .order('occurred_at', { ascending: true })
    .limit(5);
  if (fetchError) throw fetchError;
  if (!events?.length) {
    return { processed: 0, successful: 0, failed: 0, message: 'No events to process.' };
  }
  processed = events.length;

  for (const event of events) {
    try {
      const { data: device, error: deviceError } = await supabase
        .from('devices')
        .select('name, location, owner_id')
        .eq('device_id', event.device_id)
        .single();
      if (deviceError) throw deviceError;

      const userDetails = await getUserDetailsFromClerk(device.owner_id, clerkClient);
      if (!userDetails.email) throw new Error('No recipient email');

      console.log(`Sending email for event ${event.event_id} to ${userDetails.email}`);
      const { subject, html } = generateEmailContent(
        { ...event, device_name: device.name, device_location: device.location },
        userDetails
      );

      console.log(`Sending email to ${userDetails.email} with subject ${subject}`);
      await resend.emails.send({
        from: `Smart Doorbell <alerts@arthurlian.com>`,
        to: userDetails.email,
        subject,
        html,
      });
      console.log(`Email sent for event ${event.event_id}`);

      const { error: updateError } = await supabase
        .from('events')
        .update({ send_email: true })
        .eq('event_id', event.event_id);
      if (updateError) throw updateError;
      successful++;
    } catch (error) {
      console.error(`Failed to process event ${event.event_id}:`, error);
      failed++;
    }
  }

  return { processed, successful, failed, message: `Done: ${successful}/${processed} sent, ${failed} failed.` };
}

export default {
  async fetch(request, env) {
    if (request.method === 'GET') {
      return new Response('Smart Doorbell Notification Worker Running', { status: 200 });
    }
    if (request.method === 'POST') {
      const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_KEY);
      const clerkClient = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
      const resend = new Resend(env.RESEND_API_KEY);
      const result = await processEvents(supabase, resend, clerkClient);
      return new Response(JSON.stringify({ success: true, ...result }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('Method Not Allowed', { status: 405 });
  }

};