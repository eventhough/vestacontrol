-- The editable version of each sent message (JSON NoteContent: the words and their
-- settings, or a design), so "Edit a copy" can reopen it instead of a tile picture.
ALTER TABLE history ADD COLUMN content TEXT;
