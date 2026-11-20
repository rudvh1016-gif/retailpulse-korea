DROP TRIGGER a4_generation_no_delete;
CREATE TRIGGER a4_generation_no_recent_delete BEFORE DELETE ON a4_generation
WHEN julianday(OLD.observed_at) IS NULL OR julianday(OLD.observed_at) >= julianday('now', '-45 days')
BEGIN SELECT RAISE(ABORT,'retained_generation'); END;

CREATE INDEX a4_generation_terminal_observed_idx ON a4_generation(terminal, observed_at);
