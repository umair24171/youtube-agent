// Deterministic, disclosed sample workflow. No client claims or live lead actions.
export const sampleInquiry = { name: 'Alex (sample)', message: 'We need a booking website for our repair shop. Budget $1500. Can you send a proposal?', email: 'alex@example.com' };
export function processInquiry(input) {
  if (!input?.message || !input?.email) throw new Error('Inquiry needs message and email');
  const service = /website|booking/i.test(input.message) ? 'Website + booking workflow' : 'Needs human triage';
  const budget = input.message.match(/\$(\d+)/)?.[1] || null;
  return { name: input.name, email: input.email, service, budget: budget ? Number(budget) : null, status: 'Awaiting human review', replyDraft: `Hi ${input.name.split(' ')[0]}, thanks for your inquiry. We can review your ${service.toLowerCase()} requirements. Please share your preferred time for a discovery call.`, sample: true };
}
export function createDemo() {
 const lead = processInquiry(sampleInquiry);
 return { title: 'An inquiry becomes a reviewable lead', caption: 'BuildZn sample workflow: capture an inquiry, extract service and budget, and prepare a reply draft for human review. Demonstration using synthetic data; no client outcome claims. #BuildZn #BusinessAutomation #AIWorkflows', lead,
 scenes: [
 { label: 'THE PROBLEM', lines: ['An inquiry sits in your inbox.', 'Who tracks the next step?'], narration: 'An inquiry lands in your inbox. Who tracks the next step?' },
 { label: 'SAMPLE INPUT', lines: ['Alex needs a booking website.', 'Repair shop. Budget $1500.', 'alex@example.com'], narration: 'Here is a sample request. Alex needs a booking website for a repair shop, with a budget of fifteen hundred dollars.' },
 { label: 'WORKFLOW', lines: ['Capture the inquiry', 'Extract service and budget', 'Prepare a lead record'], narration: 'The workflow captures the inquiry, extracts the service and budget, and prepares a lead record.' },
 { label: 'ACTUAL SAMPLE RESULT', lines: [lead.service, `Budget $${lead.budget}`, lead.status], narration: 'This is the actual output from this sample. Website and booking workflow. Budget fifteen hundred dollars. Awaiting human review.' },
 { label: 'REPLY DRAFT', lines: ['Thanks for your inquiry, Alex.', 'Share a time for a discovery call.', 'Human approval before sending.'], narration: 'A reply draft is ready for a discovery call. A person reviews it before anything is sent.' },
 { label: 'BUILDZN', lines: ['Turn inquiries into next steps.', 'See your workflow. Review the result.', 'buildzn.com'], narration: 'BuildZn. Turn inquiries into clear next steps. This is a demonstration with synthetic data, not a client result.' }
 ] };
}
