// Installed in the restaurant's private Apps Script project alongside the completion sender.
function deliverInvitations_(singleId) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1500)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const ids = singleId ? [singleId] : callCourse_({action: 'listInvitations'}).ids;
    for (const id of ids) {
      const receipt = 'invite-sent-' + id;
      if (!props.getProperty(receipt)) {
        if (MailApp.getRemainingDailyQuota() < 1) break;
        const item = callCourse_({action: 'prepareInvitation', id: id}).invitation;
        if (!item) continue;
        const base = 'https://www.cfahueytown.com/orientation/';
        const expires = Utilities.formatDate(new Date(item.expires), 'America/Chicago', 'MMM d, yyyy, h:mm a z');
        try {
          MailApp.sendEmail({to: item.email, name: 'Chick-fil-A Hueytown Orientation',
            subject: 'Your Chick-fil-A Hueytown orientation login',
            body: ['Welcome to Chick-fil-A Hueytown!', '',
              'Open your personal link and create a password to begin orientation.',
              base + 'activate#invite=' + item.token, '', 'Sign in with ' + item.email + '.',
              'This link can be used once and expires on ' + expires + '.', '',
              'To return to the course after setup, use ' + base + 'start with your email and password.',
              '', 'Chick-fil-A Hueytown'].join('\n')});
        } catch (error) {
          console.warn('Google could not send invitation ' + id + '. It remains queued.');
          continue;
        }
        props.setProperty(receipt, '1');
      }
      callCourse_({action: 'invitationSent', id: id});
      props.deleteProperty(receipt);
    }
  } finally { lock.releaseLock(); }
}

function doPost(e) {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('invitationWake');
  let input;
  try { input = JSON.parse(e.postData.contents); } catch (error) { input = {}; }
  if (key && input && input.wake === key && typeof input.id === 'string' &&
      /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.id)) {
    deliverInvitations_(input.id);
  }
  return ContentService.createTextOutput('OK');
}

function connectInvitations() {
  const props = PropertiesService.getScriptProperties();
  let wake = props.getProperty('invitationWake');
  if (!wake) {
    wake = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('invitationWake', wake);
  }
  const url = ScriptApp.getService().getUrl();
  callCourse_({action: 'configureInvitations', url: url, wake: wake});
  console.log('Immediate invitation delivery connected.');
}
