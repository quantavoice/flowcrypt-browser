'use strict';

var requests_waiting_for_auth = {};

function gmail_api_call(account, resource, parameters, callback, fail_on_auth) {
  account_storage_get(account, 'token', function(token){
    if(typeof token !== 'undefined') { // have a valid gmail_api oauth token
      $.ajax({
          url: 'https://www.googleapis.com/gmail/v1/users/me/' + resource,
          method: 'POST',
          data: JSON.stringify(parameters),
          headers: {'Authorization': 'Bearer ' + token},
          crossDomain: true,
          contentType: 'application/json; charset=UTF-8',
          async: true,
          success: function(response) {
            callback(true, response);
          },
          error: function(response) {
            var error_obj = JSON.parse(response.responseText);
            if(typeof error_obj['error'] !== 'undefined' && error_obj['error']['message'] === "Invalid Credentials") {
              gmail_api_handle_auth_error(account, resource, parameters, callback, fail_on_auth, response);
            }
            else {
              callback(false, response);
            }
          },
      });
    }
    else { // no valid gmail_api oauth token
      gmail_api_handle_auth_error(account, resource, parameters, callback, fail_on_auth, null);
    }
  });
}

function gmail_api_handle_auth_error(account, resource, parameters, callback, fail_on_auth, error_response) {
  // send signal to initiate auth or call supplied callback
  if(fail_on_auth !== true) {
    var message_id = Math.floor(Math.random() * 100000);
    requests_waiting_for_auth[message_id] = {account: account, resource: resource, parameters: parameters, callback: callback};
    var signal_data = {message_id: message_id, account: account, signal_reply_to_listener: 'gmail_api', signal_reply_to_scope: signal_scope_get()};
    signal_send('background_process', 'gmail_auth_request', signal_data, signal_scope_default_value); //todo - later check they signed up on the right account
  }
  else{
    callback(false, error_response);
  }
}

function gmail_api_process_postponed_request(signal_data){
  var parameters = requests_waiting_for_auth[signal_data.message_id];
  gmail_api_call(parameters.account, parameters.resource, parameters.parameters, parameters.callback, true);
}

signal_listen('gmail_api', {
  gmail_auth_response: gmail_api_process_postponed_request
});

function base64url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function gmail_api_message_send(account, to, subject, thread_id, message, send_email_callback) {
  require.config({
      baseUrl: '../../js',
      paths: {
          'emailjs-mime-builder': './emailjs-mime-builder/src/emailjs-mime-builder',
          'emailjs-addressparser': './emailjs-mime-builder/node_modules/emailjs-addressparser/src/emailjs-addressparser',
          'emailjs-mime-types': './emailjs-mime-builder/node_modules/emailjs-mime-types/src/emailjs-mime-types',
          'emailjs-mime-codec': './emailjs-mime-builder/node_modules/emailjs-mime-codec/src/emailjs-mime-codec',
          'punycode': './emailjs-mime-builder/node_modules/punycode/punycode',
          'emailjs-stringencoding': './emailjs-mime-builder/node_modules/emailjs-stringencoding/src/emailjs-stringencoding',
          'sinon': './emailjs-mime-builder/node_modules/sinon/pkg/sinon',
      },
      shim: {
          sinon: {
              exports: 'sinon',
          }
      }
  });
  require(['emailjs-mime-builder'], function (MimeBuilder) {
    var raw_message = new MimeBuilder('multipart/alternative').setHeader([
      {key: 'To', value: to},
      {key: 'From', value: account},
      {key: 'Subject', value: subject}
    ]).setContent(message).build();
    if(thread_id !== null) {
      gmail_api_call(account, 'messages/send', {raw: base64url(raw_message), threadId: thread_id}, send_email_callback);
    }
    else {
      gmail_api_call(account, 'messages/send', {raw: base64url(raw_message)}, send_email_callback);
    }
  });
};
