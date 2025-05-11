const { Pool } = require('pg');
const { Resend } = require('resend');
const { Clerk } = require('@clerk/backend');

// SQL queries
const QUERIES = {
  getUnsentEvents: `
    SELECT 
      e.event_id,
      e.device_id,
      e.event_type,
      e.payload,
      e.occurred_at,
      d.name as device_name,
      d.location as device_location,
      d.owner_id,
      up.notifications_enabled
    FROM events e
    JOIN devices d ON e.device_id = d.device_id
    LEFT JOIN user_preferences up ON d.owner_id = up.user_id
    WHERE e.send_email = false 
    AND (up.notifications_enabled IS NULL OR up.notifications_enabled = true)
    ORDER BY e.occurred_at
    LIMIT 10
  `,
  updateEventStatus: `
    UPDATE events
    SET send_email = true
    WHERE event_id = $1
  `,
  getEventById: `
    SELECT 
      e.event_id,
      e.device_id,
      e.event_type,
      e.payload,
      e.occurred_at,
      d.name as device_name,
      d.location as device_location,
      d.owner_id,
      up.notifications_enabled,
      m.url as media_url,
      m.transcript as media_transcript
    FROM events e
    JOIN devices d ON e.device_id = d.device_id
    LEFT JOIN user_preferences up ON d.owner_id = up.user_id
    LEFT JOIN media m ON m.event_ref = e.event_id
    WHERE e.event_id = $1
  `
};

// Event template configuration
const EVENT_TEMPLATES = {
  doorbell_ring: {
    subject: "Doorbell Alert",
    intro: "Someone is at your doorbell",
    details: (location) => `Your doorbell was activated${location ? ` at ${location}` : ''}`,
    icon: "🚪",
    priority: "high"
  },
  motion_detected: {
    subject: "Motion Alert",
    intro: "Motion was detected",
    details: (location) => `Motion was detected${location ? ` at ${location}` : ''}`,
    icon: "👥",
    priority: "medium"
  },
  device_offline: {
    subject: "Device Offline",
    intro: "A device is offline",
    details: (location) => `Your device lost connection${location ? ` at ${location}` : ''}`,
    icon: "⚠️",
    priority: "low"
  },
  battery_low: {
    subject: "Battery Low",
    intro: "Device battery is low",
    details: (location) => `Your device needs charging${location ? ` at ${location}` : ''}`,
    icon: "🔋",
    priority: "medium"
  }
};

// Default template for unknown event types
const DEFAULT_TEMPLATE = {
  subject: "Smart Home Alert",
  intro: "New alert from your device",
  details: (location) => `An event was detected${location ? ` at ${location}` : ''}`,
  icon: "🏠",
  priority: "medium"
};

function createPgClient(connectionString) {
  return new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });
}

async function getUserInfo(userId, clerk) {
  try {
    const user = await clerk.users.getUser(userId);
    return {
      firstName: user.firstName || '',
      email: user.emailAddresses[0]?.emailAddress // Get primary email
    };
  } catch (error) {
    console.error(`Error fetching user info from Clerk: ${error}`);
    throw error;
  }
}

function generateEmailContent(event, userInfo) {
  const { 
    event_type, 
    device_name, 
    device_location,
    payload, 
    occurred_at,
    media_url,
    media_transcript 
  } = event;
  
  const date = new Date(occurred_at).toLocaleString();
  
  const template = EVENT_TEMPLATES[event_type] || DEFAULT_TEMPLATE;
  
  const subject = `${template.icon} ${template.subject}: ${device_name}`;
  const intro = `${template.intro}!`;
  const details = template.details(device_location);
  
  const additionalInfo = payload.message || '';
  
  // Generate HTML template
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
          margin: 0; 
          padding: 0; 
          color: #333; 
          line-height: 1.6;
        }
        .container { 
          max-width: 600px; 
          margin: 0 auto; 
          padding: 20px;
          background: #ffffff;
        }
        .header { 
          background-color: ${template.priority === 'high' ? '#ff4444' : 
                            template.priority === 'medium' ? '#4a90e2' : '#666666'}; 
          padding: 20px; 
          color: white;
          border-radius: 8px 8px 0 0;
        }
        .content { 
          padding: 30px; 
          background: #f9f9f9;
          border: 1px solid #eee;
          border-top: none;
          border-radius: 0 0 8px 8px;
        }
        .event-icon {
          font-size: 2em;
          margin-bottom: 10px;
        }
        .event-time {
          color: #666;
          font-size: 0.9em;
          margin-top: 20px;
          padding-top: 20px;
          border-top: 1px solid #eee;
        }
        .media-section {
          margin-top: 20px;
          padding: 15px;
          background: #fff;
          border: 1px solid #eee;
          border-radius: 4px;
        }
        .transcript {
          margin-top: 10px;
          padding: 10px;
          background: #f5f5f5;
          border-radius: 4px;
          font-style: italic;
        }
        .footer { 
          padding: 20px; 
          text-align: center; 
          font-size: 12px; 
          color: #666;
          margin-top: 20px;
        }
        @media only screen and (max-width: 480px) {
          .container { padding: 10px; }
          .header, .content { padding: 15px; }
        }
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
    </html>
  `;
  
  return { subject, html };
}

async function processEvents(pgClient, resend, clerk) {
  try {
    // Get unsent events
    const { rows: events } = await pgClient.query(QUERIES.getUnsentEvents);
    
    if (events.length === 0) {
      console.log('No new events to process');
      return [];
    }
    
    console.log(`Processing ${events.length} new events`);
    const results = [];
    
    // Process each event
    for (const event of events) {
      try {
        // Get user info from Clerk
        const userInfo = await getUserInfo(event.owner_id, clerk);
        
        if (!userInfo.email) {
          throw new Error(`No email found for user ${event.owner_id}`);
        }
        
        // Generate email content
        const { subject, html } = generateEmailContent(event, userInfo);
        
        // Send email
        const { data: emailResult } = await resend.emails.send({
          from: `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM_ADDRESS}>`,
          to: userInfo.email,
          subject: subject,
          html: html,
        });
        
        // Update event status
        await pgClient.query(QUERIES.updateEventStatus, [event.event_id]);
        
        results.push({
          event_id: event.event_id,
          success: true,
          email_id: emailResult.id
        });
        
        console.log(`Event ${event.event_id} processed successfully`);
      } catch (error) {
        console.error(`Error processing event ${event.event_id}:`, error);
        results.push({
          event_id: event.event_id,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error in processEvents:', error);
    throw error;
  }
}

async function processSingleEvent(pgClient, resend, clerk, eventId) {
  try {
    // Get event details
    const { rows } = await pgClient.query(QUERIES.getEventById, [eventId]);
    
    if (rows.length === 0) {
      throw new Error(`Event with ID ${eventId} not found`);
    }
    
    const event = rows[0];
    
    // Get user info from Clerk
    const userInfo = await getUserInfo(event.owner_id, clerk);
    
    if (!userInfo.email) {
      throw new Error(`No email found for user ${event.owner_id}`);
    }
    
    // Generate email content
    const { subject, html } = generateEmailContent(event, userInfo);
    
    // Send email
    const { data: emailResult } = await resend.emails.send({
      from: `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM_ADDRESS}>`,
      to: userInfo.email,
      subject: subject,
      html: html,
    });
    
    // Update event status
    await pgClient.query(QUERIES.updateEventStatus, [event.event_id]);
    
    return {
      event_id: event.event_id,
      success: true,
      email_id: emailResult.id
    };
  } catch (error) {
    console.error(`Error processing event ${eventId}:`, error);
    throw error;
  }
}

export default {
  // HTTP request handler - for API requests and webhook from Supabase
  async fetch(request, env, ctx) {
    // Setup database and email clients
    const pgClient = createPgClient(env.DATABASE_URL);
    const resend = new Resend(env.RESEND_API_KEY);
    const clerk = Clerk({ secretKey: env.CLERK_SECRET_KEY });
    
    try {
      // Handle health check
      if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
        return new Response('Smart Doorbell Notification Worker Running', { status: 200 });
      }
      
      // Handle manual processing endpoint
      if (request.method === 'GET' && new URL(request.url).pathname === '/process') {
        const results = await processEvents(pgClient, resend, clerk);
        return new Response(JSON.stringify({ success: true, results }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Handle webhook from Supabase
      if (request.method === 'POST' && new URL(request.url).pathname === '/webhook') {
        // Verify webhook request (would implement proper verification in production)
        const payload = await request.json();
        
        if (payload.table !== 'events' || payload.type !== 'INSERT') {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Not a valid events insert webhook' 
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        // Process the new event
        const eventId = payload.record.event_id;
        const result = await processSingleEvent(pgClient, resend, clerk, eventId);
        
        return new Response(JSON.stringify({ 
          success: true, 
          result 
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Handle unsupported routes
      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('Request error:', error);
      return new Response(JSON.stringify({ 
        success: false, 
        error: error.message 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    } finally {
      await pgClient.end();
    }
  },
  
  // Scheduled handler - for processing events via cron job
  async scheduled(event, env, ctx) {
    const pgClient = createPgClient(env.DATABASE_URL);
    const resend = new Resend(env.RESEND_API_KEY);
    const clerk = Clerk({ secretKey: env.CLERK_SECRET_KEY });
    
    try {
      console.log('Running scheduled event processor');
      await processEvents(pgClient, resend, clerk);
    } catch (error) {
      console.error('Scheduled job error:', error);
      throw error;
    } finally {
      await pgClient.end();
    }
  }
};