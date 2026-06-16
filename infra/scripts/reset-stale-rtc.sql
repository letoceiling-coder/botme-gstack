UPDATE visitor_sessions SET "controlMode" = 'OPERATOR' WHERE "controlMode" = 'RTC_ACTIVE';
UPDATE call_sessions SET status = 'ENDED', "endedAt" = NOW() WHERE status IN ('INVITED', 'ACTIVE');
