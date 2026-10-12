# Confidential HR notes and shared request history

On the opted-in parity site, the request form offers **Confidential HR Notes** and
**Add Confidential HR Note** to a recruiter with sensitive access covering every
request location. The note has its own native form and list. Requester access to
the hiring request does not give access to these notes.

Notes are immutable. Add a correction as a new note; the original author and
creation time remain. Creating a note does not save the hiring request, create a
shared Comment/Version/event, send a notification or alter a reviewed snapshot.
No ordinary note export, print, email or sharing permission is granted. Private
files inherit the confidential parent permission. Administrator retains the
framework's documented operational access.

A user who also holds the Requester role may read notes when separately granted
the Recruiter role and sensitive scope. This is explicit capability-based access,
not a blanket exclusion for everyone who has ever submitted a request.

Public decision reasons, approval comments and vacancy audit reasons remain
shared with the requester. Confidential content belongs only in the separate
note form. The system does not attempt to infer secrecy from free text.

New shared approval snapshots use an explicit request/line/step schema. New or
custom salary/internal fields are not automatically included by serializing an
entire document. Snapshots retain the public revision, quantities, routing,
authority, decision and timing details. Historical snapshots remain immutable;
this change does not claim to sanitize data previously stored by older code.

Verification is in `kandil_hr/recruitment/test_privacy.py`; execution evidence is
recorded separately after the native suite runs. This does not establish generic
field privacy for every upstream HRMS DocType or external custom integration.

Once notes exist, native request saves cannot change company, department or capacity/location identities. Create a separate request for a new scope; quantities and public text may still be revised under the normal workflow. This prevents moving confidential notes into another HR team’s scope through a draft edit.

Native form creation needs the role-level Write flag for editable inputs. The document permission hook grants Write only while a note is new; all persisted note writes are denied, and the controller independently rejects editing or deleting. This is verified by both native API tests and the ordinary HR browser form.
