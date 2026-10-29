org.webosports.service.tweaks.prefs
===================================

The tweaks store. Preference files (`*.json` in
`/usr/palm/services/org.webosports.service.tweaks.prefs/preferences`, and
in the same path under `/media/cryptofs/apps`) declare the tweaks of an
owner (the shell, the phone app, a patch); the service keeps them, with
the value chosen for each, in one db8 object of kind
`org.webosports.tweaks:1`. The Tweaks app reads that object directly;
Settings, the shell (LuneOS.Components' `Tweak`) and the phone app ask
for values through `/get`, and change them through `/set`.

The service is a Node 22 rewrite of the mojoservice one (the assistants
that were in `assistants/`), for the launcher's plain-node path
(`run-js-service` requires the directory, as it has a `package.json`, and
calls `run()`). Foundations and mojoservice are no longer loaded.

| | |
|---|---|
| `service.js` | start-up: the bus and the four methods |
| `lib/commands.js` | `get`, `set`, `scan`, `list`, answering as the old service did |
| `lib/prefs.js` | the store: the scan of the preference files, reads, the write queue, the subscribers |
| `lib/mojo.js` | the mojoservice reply envelope (from the contacts linker) |
| `lib/bus.js`, `lib/errors.js` | the bus, through palmbus directly (from the cloud connectors, by way of the messaging service and the contacts linker), with subscriptions added |

Methods
-------

- `get {owner, key | keys, subscribe?}` -> `{returnValue, <key>: value, ...}`:
  the values stored for those tweaks of `owner`; a tweak not stored is left
  out. A tweak the store does not hold makes the service scan the files
  first. With `"subscribe": true` the call stays open (`subscribed: true`
  in its first reply) and gets `{owner, <key>: value, returnValue, fired}`
  whenever `/set` changes one of its keys; it ends when the caller cancels
  it, or with the service. While one is open the service does not exit.
- `set {owner, <key>: value, ...}`: stores them and tells the subscribers.
  A key no file declares for `owner` is left out and listed in
  `unknown`; a call naming only such keys fails, -1 "No such tweak for
  <owner>: <keys>". Arguments starting with `$` are not keys.
- `scan`: builds the store from the files again, keeping each value chosen
  for a tweak still in the same category and group.
- `list {path?, filter?}`: the files (or with `filter: "dirs"` the
  directories) in `path` (`/media/internal/downloads`), for the Tweaks
  app's file picker. A path it cannot read is refused.

A refusal (no `owner`, no `key`, a path `list` cannot read) is errorCode -1 with
`exception: "[object Object]"`, as the old service gave it; any other error
is mojoservice's -9999 "MojoService: no errorCode supplied ...", or the
db8 error as Foundations' PalmCall gave it.

The stored format
-----------------

Unchanged: a property per category (`browser`, `calendar`, `camera`,
`clock`, `contacts`, `email`, `luna`, `messaging`, `phone`, `system`, and
any other a file names, in lower case), in each a property per group
(lower case) holding a list of
`{owner, type, key, restart, prefserv, help, label, value}`, with
`min`/`max` (IntegerPicker), `choices` (ListSelector), `input`
(TextField) or `path`/`filter`/`select` (FilePicker).

The old service's bugs
----------------------

The first version gave the same replies and made the same db8 calls as
the old service, these bugs included; the commits after it mend them one
at a time (each says so below), and the tests and commits refer to them
by number:

1. After a FilePicker tweak, the scan read the rest of that directory's
   files from the tweak's `path` (`/media/internal/downloads` by
   default): the FilePicker branch declared a `var path` of its own,
   which was the directory being read. A file not there failed the scan
   with ENOENT; one there of the same name was read instead. Mended.
2. One broken entry failed every scan: an entry without a `category`, an
   entry or tweak that is `null`, a category or group that is not a
   string, or a `*.json` that cannot be read (a directory). Then every
   `/get` or `/set` of a tweak not yet stored failed too. Mended: such an
   entry, tweak or file is left out (and logged), and so is a category
   starting with `_`, which would be one of the object's own properties.
3. `list` of a path it cannot read answered `returnValue: true`, with the
   error object as `exception` and no `files`; the Tweaks app then read
   `files.length` of undefined. Mended: refused, errorCode -1 with the
   file system's message.
4. `list` failed as a whole on one entry it cannot stat (a dangling
   symlink). Mended: that entry is left out.

Still as they were, and why:

- A `/get` or `/set` of a tweak no file declares scans and rewrites the
  whole store, each time. Every tweak the shell, Settings and the phone app
  ask for is declared, so on a device this does not happen; a scan that
  wrote only what changed would change the db8 traffic the A/B compares.
- A value chosen is kept by `scan` only while its tweak stays in the same
  category and group: a file that moves it resets it to the file's value.
- With two objects of the kind stored, every call fails, "More than 1
  preferences object found".
- `set` compares values as JSON text, so an object with its keys in
  another order than db8 gives them back is written, and told to the
  subscribers, as a change.

These things deliberately differ from the old service:

- No activity is made for each call. mojoservice created one through
  activitymanager for every command and completed it after; nothing
  watched them. An `$activity` a caller passes is still monitored.
- The bus's own methods are `info` and `quit`, as the other node
  services have them, instead of mojoservice's `__info`, `__quit` and
  `__gc`.
- A subscription cancelled before its first reply leaves nothing behind.
  The old service registered its subscriber after the cancel, and never
  removed it; nothing could be sent to it.

Tests
-----

    tests/run.sh

This runs the unit tests (`node --test`) over an in-memory db8
(`tests/fakedb.js`, written to what db8 did on the VM) and a stand-in bus
(`tests/palmbus.js`), with preference directories of their own under
`tests/.work`, then jshint (set `JSHINT`) and a parse of every module.

Licence
-------

This rewrite is licensed under the GNU General Public License, version 3
or (at your option) any later version: see COPYING. The rest of the
tweaks repository (the Tweaks app, the bus configuration in files/, this
directory's configuration/) keeps its licence, MIT as the recipe gives it.

    Copyright (c) 2026 Herman van Hazendonk

lib/prefs.js and lib/commands.js port the old service's assistants step
by step, and say so in their headers; that code is MIT-licensed, and its
notice is in MIT-NOTICE (the repository has no copyright line of its own:
MIT-NOTICE names the authors from its git history). lib/mojo.js reproduces
mojoservice's and Foundations' replies, and keeps their notice: Copyright
2009-2012 Hewlett-Packard Development Company, L.P., licensed under the
Apache License, Version 2.0, which allows it to be part of a GPL-3.0 work.
lib/bus.js and lib/errors.js (from luneos-synergy-connectors), service.js
and the tests have no old lineage.
