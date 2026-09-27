-- FlyTiee: one server-owned inventory and atomic rewards.
-- Run AFTER flytiee-events-schema.sql, online-study-time.sql and
-- learning-streak-rewards.sql, learning-streak-phoenix-200.sql and
-- flytiee-adventure.sql, BEFORE deploying the
-- matching web build. Keep this file LAST: it replaces the older metadata-
-- writing reward functions installed by the two latter files.
-- The one-time legacy import trusts existing user_metadata only at cutover;
-- subsequent client changes to that metadata are never read as game state.
BEGIN;

ALTER TABLE public.flytiee_profiles
  ADD COLUMN IF NOT EXISTS legacy_imported_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.flytiee_catalog (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('accessory', 'skin', 'set')),
  price INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
  slot TEXT CHECK (slot IS NULL OR slot IN ('head', 'eyes', 'neck', 'hand')),
  chest_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  CHECK ((kind = 'accessory') = (slot IS NOT NULL))
);
ALTER TABLE public.flytiee_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flytiee_catalog FROM PUBLIC, anon, authenticated;

INSERT INTO public.flytiee_catalog (id, kind, price, slot, chest_eligible) VALUES
  ('cat-bow-headband','accessory',55,'head',true),
  ('sweet-heart-glasses','accessory',45,'eyes',true),
  ('pink-kawaii-bow','accessory',40,'neck',true),
  ('cat-mini-bag','accessory',50,'hand',true),
  ('heart-magic-wand','accessory',55,'hand',true),
  ('santa-hat','accessory',55,'head',true),
  ('snowflake-glasses','accessory',45,'eyes',true),
  ('jingle-bell','accessory',45,'neck',true),
  ('candy-cane','accessory',40,'hand',true),
  ('christmas-gift','accessory',50,'hand',true),
  ('moon-rabbit','accessory',50,'head',true),
  ('moon-glasses','accessory',45,'eyes',true),
  ('moon-pendant','accessory',40,'neck',true),
  ('star-lantern','accessory',55,'hand',true),
  ('moon-cake','accessory',35,'hand',true),
  ('focus-band','accessory',25,'head',true),
  ('graduation-cap','accessory',65,'head',true),
  ('round-glasses','accessory',35,'eyes',true),
  ('lab-goggles','accessory',45,'eyes',true),
  ('red-scarf','accessory',30,'neck',true),
  ('class-bow','accessory',30,'neck',true),
  ('study-pencil','accessory',40,'hand',true),
  ('idea-book','accessory',45,'hand',true),
  ('witch-hat','accessory',70,'head',true),
  ('pumpkin-headband','accessory',55,'head',true),
  ('bat-wing-glasses','accessory',60,'eyes',true),
  ('vampire-bow','accessory',65,'neck',true),
  ('ghost-candy-bag','accessory',55,'hand',true),
  ('pumpkin-lantern','accessory',65,'hand',true),
  ('magic-spellbook','accessory',75,'hand',true),
  ('vietnam-conical-hat','accessory',65,'head',true),
  ('vietnam-star-headband','accessory',50,'head',true),
  ('lotus-glasses','accessory',55,'eyes',true),
  ('southern-checkered-scarf','accessory',50,'neck',true),
  ('vietnam-national-flag','accessory',65,'hand',true),
  ('dong-son-drum','accessory',75,'hand',true),
  ('lotus-lantern','accessory',60,'hand',true),
  ('summer-straw-hat','accessory',65,'head',true),
  ('hibiscus-hair-clip','accessory',50,'head',true),
  ('ocean-sunglasses','accessory',60,'eyes',true),
  ('tropical-flower-lei','accessory',60,'neck',true),
  ('cool-coconut','accessory',55,'hand',true),
  ('summer-beach-ball','accessory',50,'hand',true),
  ('mini-surfboard','accessory',75,'hand',true),
  ('tet-khan-dong','accessory',75,'head',true),
  ('tet-peach-headdress','accessory',65,'head',true),
  ('tet-apricot-glasses','accessory',55,'eyes',true),
  ('tet-lucky-coin-necklace','accessory',55,'neck',true),
  ('tet-brocade-scarf','accessory',65,'neck',true),
  ('tet-peach-branch','accessory',70,'hand',true),
  ('tet-red-envelope','accessory',45,'hand',true),
  ('tet-banh-chung','accessory',55,'hand',true),
  ('tet-red-lantern','accessory',65,'hand',true),
  ('classic','skin',0,NULL,false),
  ('sakura','skin',130,NULL,true),
  ('golden-canary','skin',155,NULL,true),
  ('pastel-jade','skin',120,NULL,true),
  ('black-hawk','skin',195,NULL,true),
  ('lavender-cloud','skin',145,NULL,true),
  ('cosmic-explorer','set',0,NULL,true),
  ('dino-dreamer','set',0,NULL,true),
  ('snowy-christmas','set',0,NULL,true),
  ('shadow-ninja','set',0,NULL,true),
  ('mushroom-kingdom','set',0,NULL,true),
  ('phoenix-dawn','set',0,NULL,false),
  ('azure-tide-dragon','set',0,NULL,true)
ON CONFLICT (id) DO UPDATE SET
  kind = EXCLUDED.kind, price = EXCLUDED.price, slot = EXCLUDED.slot,
  chest_eligible = EXCLUDED.chest_eligible;

CREATE OR REPLACE FUNCTION public.flytiee_try_legacy_date(p_value TEXT)
RETURNS DATE LANGUAGE plpgsql AS $$
BEGIN
  RETURN p_value::DATE;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$;
CREATE OR REPLACE FUNCTION public.flytiee_try_legacy_timestamp(p_value TEXT)
RETURNS TIMESTAMPTZ LANGUAGE plpgsql AS $$
BEGIN
  RETURN p_value::TIMESTAMPTZ;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$;

-- Import the pre-existing client profile once. Use maxima for balances because
-- gift codes / adventure already mirrored some (but not all) rewards to SQL.
-- Union ownership and import claim flags so today's rewards cannot be repeated.
DO $$
DECLARE
  v_user RECORD;
  v_legacy JSONB;
  v_daily JSONB;
  v_day DATE;
  v_code TEXT;
  v_claim TEXT;
BEGIN
  FOR v_user IN
    SELECT id, raw_user_meta_data -> 'flytiee' AS legacy
    FROM auth.users
    WHERE jsonb_typeof(raw_user_meta_data -> 'flytiee') = 'object'
  LOOP
    v_legacy := v_user.legacy;
    INSERT INTO public.flytiee_profiles (user_id) VALUES (v_user.id)
      ON CONFLICT (user_id) DO NOTHING;
    IF EXISTS (SELECT 1 FROM public.flytiee_profiles
               WHERE user_id = v_user.id AND legacy_imported_at IS NULL) THEN
      UPDATE public.flytiee_profiles p SET
        name = CASE WHEN length(btrim(v_legacy ->> 'name')) BETWEEN 2 AND 20
          THEN btrim(v_legacy ->> 'name') ELSE p.name END,
        level = GREATEST(p.level, CASE WHEN v_legacy ->> 'level' ~ '^[0-9]{1,6}$'
          THEN (v_legacy ->> 'level')::INTEGER ELSE 1 END),
        xp = GREATEST(p.xp, CASE WHEN v_legacy ->> 'xp' ~ '^[0-9]{1,9}$'
          THEN (v_legacy ->> 'xp')::INTEGER ELSE 0 END),
        coins = GREATEST(p.coins, CASE WHEN v_legacy ->> 'coins' ~ '^[0-9]{1,9}$'
          THEN (v_legacy ->> 'coins')::INTEGER ELSE 0 END),
        satiety = CASE WHEN v_legacy ->> 'satiety' ~ '^[0-9]{1,3}$'
          THEN LEAST(100, (v_legacy ->> 'satiety')::INTEGER) ELSE p.satiety END,
        satiety_updated_at = coalesce(public.flytiee_try_legacy_timestamp(
          v_legacy ->> 'satietyUpdatedAt'), p.satiety_updated_at),
        owned_accessory_ids = ARRAY(SELECT DISTINCT x FROM unnest(
          p.owned_accessory_ids || ARRAY(SELECT jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(v_legacy -> 'ownedAccessoryIds') = 'array'
              THEN v_legacy -> 'ownedAccessoryIds' ELSE '[]'::jsonb END))) AS x
          WHERE x IN (SELECT id FROM public.flytiee_catalog WHERE kind = 'accessory')),
        owned_skin_ids = ARRAY(SELECT DISTINCT x FROM unnest(
          p.owned_skin_ids || ARRAY(SELECT jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(v_legacy -> 'ownedSkinIds') = 'array'
              THEN v_legacy -> 'ownedSkinIds' ELSE '[]'::jsonb END))) AS x
          WHERE x IN (SELECT id FROM public.flytiee_catalog WHERE kind = 'skin')),
        owned_set_ids = ARRAY(SELECT DISTINCT x FROM unnest(
          p.owned_set_ids || ARRAY(SELECT jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(v_legacy -> 'ownedSetIds') = 'array'
              THEN v_legacy -> 'ownedSetIds' ELSE '[]'::jsonb END))) AS x
          WHERE x IN (SELECT id FROM public.flytiee_catalog WHERE kind = 'set')
            AND (x <> 'phoenix-dawn' OR EXISTS (
              SELECT 1 FROM public.learning_streak_claims
              WHERE user_id = v_user.id AND milestone = 200))),
        chests = jsonb_build_object(
          'bronze', GREATEST(coalesce((p.chests ->> 'bronze')::INTEGER, 0),
            CASE WHEN v_legacy #>> '{chests,bronze}' ~ '^[0-9]{1,7}$' THEN (v_legacy #>> '{chests,bronze}')::INTEGER ELSE 0 END),
          'silver', GREATEST(coalesce((p.chests ->> 'silver')::INTEGER, 0),
            CASE WHEN v_legacy #>> '{chests,silver}' ~ '^[0-9]{1,7}$' THEN (v_legacy #>> '{chests,silver}')::INTEGER ELSE 0 END),
          'gold', GREATEST(coalesce((p.chests ->> 'gold')::INTEGER, 0),
            CASE WHEN v_legacy #>> '{chests,gold}' ~ '^[0-9]{1,7}$' THEN (v_legacy #>> '{chests,gold}')::INTEGER ELSE 0 END)),
        redeemed_mail_codes = ARRAY(SELECT DISTINCT x FROM unnest(
          p.redeemed_mail_codes || ARRAY(SELECT jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(v_legacy -> 'redeemedMailCodes') = 'array'
              THEN v_legacy -> 'redeemedMailCodes' ELSE '[]'::jsonb END))) AS x),
        legacy_imported_at = now()
      WHERE p.user_id = v_user.id;

      -- A purchased/equipped appearance must survive the cutover too.
      UPDATE public.flytiee_profiles p SET
        equipped_skin_id = CASE WHEN v_legacy ->> 'equippedSkinId' = ANY(p.owned_skin_ids)
          THEN v_legacy ->> 'equippedSkinId' ELSE p.equipped_skin_id END,
        equipped_set_id = CASE WHEN v_legacy ->> 'equippedSetId' = ANY(p.owned_set_ids)
          THEN v_legacy ->> 'equippedSetId' ELSE p.equipped_set_id END,
        equipped = CASE WHEN jsonb_typeof(v_legacy -> 'equipped') = 'object'
          THEN v_legacy -> 'equipped' ELSE p.equipped END
      WHERE p.user_id = v_user.id;

      v_daily := v_legacy -> 'dailyEvent';
      v_day := public.flytiee_try_legacy_date(v_daily ->> 'date');
      IF jsonb_typeof(v_daily) = 'object' AND v_day IS NOT NULL THEN
        INSERT INTO public.flytiee_daily_events
          (user_id, event_date, streak_claimed, study_claimed_milestones,
           practice_coins_claimed, completion_chest_claimed)
        VALUES (v_user.id, v_day,
          coalesce(lower(v_daily ->> 'streakClaimed') = 'true', false),
          ARRAY(SELECT DISTINCT x::SMALLINT FROM jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(v_daily -> 'studyClaimedMilestones') = 'array'
              THEN v_daily -> 'studyClaimedMilestones' ELSE '[]'::jsonb END) AS x
            WHERE x IN ('15','45','90')),
          LEAST(100, CASE WHEN v_daily ->> 'practiceCoinsClaimed' ~ '^[0-9]{1,3}$'
            THEN (v_daily ->> 'practiceCoinsClaimed')::INTEGER ELSE 0 END),
          coalesce(lower(v_daily ->> 'completionChestClaimed') = 'true', false))
        ON CONFLICT (user_id, event_date) DO UPDATE SET
          streak_claimed = public.flytiee_daily_events.streak_claimed OR EXCLUDED.streak_claimed,
          study_claimed_milestones = ARRAY(SELECT DISTINCT x FROM unnest(
            public.flytiee_daily_events.study_claimed_milestones || EXCLUDED.study_claimed_milestones) AS x),
          practice_coins_claimed = GREATEST(public.flytiee_daily_events.practice_coins_claimed, EXCLUDED.practice_coins_claimed),
          completion_chest_claimed = public.flytiee_daily_events.completion_chest_claimed OR EXCLUDED.completion_chest_claimed;
      END IF;

      FOR v_claim IN SELECT jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(v_legacy -> 'claimedMissionIds') = 'array'
          THEN v_legacy -> 'claimedMissionIds' ELSE '[]'::jsonb END)
      LOOP
        IF v_claim ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}:(practice-5|practice-15|accuracy-80|mock-exam-1)$'
          AND public.flytiee_try_legacy_date(split_part(v_claim, ':', 1)) IS NOT NULL THEN
          INSERT INTO public.flytiee_mission_claims (user_id, mission_id, reward_date)
          VALUES (v_user.id, split_part(v_claim, ':', 2), split_part(v_claim, ':', 1)::DATE)
          ON CONFLICT DO NOTHING;
        END IF;
      END LOOP;

      FOR v_code IN SELECT jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(v_legacy -> 'redeemedMailCodes') = 'array'
          THEN v_legacy -> 'redeemedMailCodes' ELSE '[]'::jsonb END)
      LOOP
        INSERT INTO public.flytiee_gift_code_redemptions (gift_code_id, user_id)
        SELECT id, v_user.id FROM public.flytiee_gift_codes WHERE code = v_code
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;
  END LOOP;
  UPDATE public.flytiee_profiles SET legacy_imported_at = now()
    WHERE legacy_imported_at IS NULL;
  UPDATE public.flytiee_gift_codes g SET redemption_count = GREATEST(
    redemption_count, (SELECT count(*) FROM public.flytiee_gift_code_redemptions r WHERE r.gift_code_id = g.id));
END;
$$;

DROP FUNCTION public.flytiee_try_legacy_date(TEXT);
DROP FUNCTION public.flytiee_try_legacy_timestamp(TEXT);

ALTER TABLE public.flytiee_profiles
  ALTER COLUMN legacy_imported_at SET DEFAULT now();

-- Keep the display-only redeemed-code list aligned with the server receipt.
CREATE OR REPLACE FUNCTION public.flytiee_note_redeemed_code()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_code TEXT;
BEGIN
  SELECT code INTO v_code FROM public.flytiee_gift_codes WHERE id = NEW.gift_code_id;
  UPDATE public.flytiee_profiles SET redeemed_mail_codes =
    CASE WHEN v_code = ANY(redeemed_mail_codes) THEN redeemed_mail_codes
      ELSE array_append(redeemed_mail_codes, v_code) END
    WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS flytiee_note_redeemed_code ON public.flytiee_gift_code_redemptions;
CREATE TRIGGER flytiee_note_redeemed_code
  AFTER INSERT ON public.flytiee_gift_code_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.flytiee_note_redeemed_code();
REVOKE ALL ON FUNCTION public.flytiee_note_redeemed_code() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.flytiee_get_state()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user UUID := auth.uid();
  v_day DATE := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE;
  v_profile public.flytiee_profiles%ROWTYPE;
  v_daily public.flytiee_daily_events%ROWTYPE;
  v_claims JSONB;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Hãy đăng nhập để dùng FlyTiee.'; END IF;
  PERFORM public.ensure_flytiee_profile();
  INSERT INTO public.flytiee_daily_events (user_id, event_date)
    VALUES (v_user, v_day) ON CONFLICT DO NOTHING;
  SELECT * INTO v_profile FROM public.flytiee_profiles WHERE user_id = v_user;
  SELECT * INTO v_daily FROM public.flytiee_daily_events
    WHERE user_id = v_user AND event_date = v_day;
  SELECT coalesce(jsonb_agg(to_char(reward_date, 'YYYY-MM-DD') || ':' || mission_id
    ORDER BY reward_date, mission_id), '[]'::jsonb) INTO v_claims
    FROM (SELECT reward_date, mission_id FROM public.flytiee_mission_claims
      WHERE user_id = v_user ORDER BY reward_date DESC, mission_id LIMIT 120) AS recent;
  RETURN jsonb_build_object('profile', jsonb_build_object(
    'version', 1, 'name', v_profile.name, 'level', v_profile.level, 'xp', v_profile.xp,
    'coins', v_profile.coins, 'satiety', v_profile.satiety,
    'satietyUpdatedAt', v_profile.satiety_updated_at,
    'ownedAccessoryIds', v_profile.owned_accessory_ids, 'equipped', v_profile.equipped,
    'ownedSkinIds', v_profile.owned_skin_ids, 'equippedSkinId', v_profile.equipped_skin_id,
    'ownedSetIds', v_profile.owned_set_ids, 'equippedSetId', v_profile.equipped_set_id,
    'claimedMissionIds', v_claims, 'chests', v_profile.chests,
    'redeemedMailCodes', v_profile.redeemed_mail_codes,
    'dailyEvent', jsonb_build_object(
      'date', v_day, 'streakClaimed', v_daily.streak_claimed,
      'studyClaimedMilestones', v_daily.study_claimed_milestones,
      'practiceCoinsClaimed', v_daily.practice_coins_claimed,
      'completionChestClaimed', v_daily.completion_chest_claimed)));
END;
$$;

CREATE OR REPLACE FUNCTION public.flytiee_action(p_action TEXT, p_payload JSONB DEFAULT '{}'::JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user UUID := auth.uid();
  v_day DATE := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE;
  v_start TIMESTAMPTZ := ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE::TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_profile public.flytiee_profiles%ROWTYPE;
  v_daily public.flytiee_daily_events%ROWTYPE;
  v_item public.flytiee_catalog%ROWTYPE;
  v_id TEXT := p_payload ->> 'id';
  v_tier TEXT := p_payload ->> 'tier';
  v_minutes INTEGER;
  v_answered INTEGER;
  v_correct INTEGER;
  v_earned INTEGER;
  v_mock INTEGER;
  v_streak INTEGER;
  v_day_in_cycle INTEGER;
  v_roll INTEGER;
  v_amount INTEGER := 0;
  v_xp INTEGER := 0;
  v_level INTEGER;
  v_remaining_xp INTEGER;
  v_price INTEGER;
  v_name TEXT;
  v_reward JSONB := NULL;
  v_source TEXT := NULL;
  v_kind TEXT := NULL;
  v_chest TEXT := NULL;
  v_reward_item TEXT := NULL;
  v_reference TEXT := NULL;
  v_equipped JSONB;
  v_pool INTEGER[];
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Hãy đăng nhập để dùng FlyTiee.'; END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Dữ liệu thao tác không hợp lệ.';
  END IF;
  PERFORM public.ensure_flytiee_profile();
  SELECT * INTO v_profile FROM public.flytiee_profiles WHERE user_id = v_user FOR UPDATE;
  INSERT INTO public.flytiee_daily_events (user_id, event_date)
    VALUES (v_user, v_day) ON CONFLICT DO NOTHING;
  SELECT * INTO v_daily FROM public.flytiee_daily_events
    WHERE user_id = v_user AND event_date = v_day FOR UPDATE;

  IF p_action = 'rename' THEN
    v_name := btrim(regexp_replace(coalesce(p_payload ->> 'name', ''), '[[:space:]]+', ' ', 'g'));
    IF length(v_name) NOT BETWEEN 2 AND 20 THEN RAISE EXCEPTION 'Tên FlyTiee cần từ 2 đến 20 ký tự.'; END IF;
    UPDATE public.flytiee_profiles SET name = v_name WHERE user_id = v_user;

  ELSIF p_action = 'feed' THEN
    UPDATE public.flytiee_profiles SET satiety = 100, satiety_updated_at = now() WHERE user_id = v_user;

  ELSIF p_action = 'mission' THEN
    IF v_id IS NULL OR v_id NOT IN ('practice-5', 'practice-15', 'accuracy-80', 'mock-exam-1') THEN
      RAISE EXCEPTION 'Nhiệm vụ không hợp lệ.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.flytiee_mission_claims
      WHERE user_id = v_user AND reward_date = v_day AND mission_id = v_id) THEN
      RAISE EXCEPTION 'Nhiệm vụ này đã nhận hôm nay.';
    END IF;
    SELECT count(*), count(*) FILTER (WHERE is_correct)
      INTO v_answered, v_correct FROM public.practice_progress
      WHERE user_id = v_user AND answered_at >= v_start AND answered_at < v_start + interval '1 day';
    SELECT count(*) INTO v_mock FROM public.mock_exam_attempts
      WHERE user_id = v_user AND created_at >= v_start AND created_at < v_start + interval '1 day';
    IF (v_id = 'practice-5' AND v_answered < 5)
      OR (v_id = 'practice-15' AND v_answered < 15)
      OR (v_id = 'accuracy-80' AND (v_answered < 10 OR v_correct * 100 < v_answered * 80))
      OR (v_id = 'mock-exam-1' AND v_mock < 1) THEN
      RAISE EXCEPTION 'Nhiệm vụ chưa đạt điều kiện nhận thưởng.';
    END IF;
    v_amount := CASE v_id WHEN 'practice-5' THEN 20 WHEN 'practice-15' THEN 35
      WHEN 'accuracy-80' THEN 30 ELSE 45 END;
    v_xp := v_amount;
    INSERT INTO public.flytiee_mission_claims
      (user_id, mission_id, reward_date, xp_granted, coins_granted)
      VALUES (v_user, v_id, v_day, v_xp, v_amount);
    v_source := 'mission'; v_kind := 'coins'; v_reference := v_id;
    v_reward := jsonb_build_object('kind','coins','title','Nhiệm vụ hoàn thành',
      'description',format('Đã nhận %s EXP và %s xu!',v_xp,v_amount),
      'amount',v_amount,'xp',v_xp);

  ELSIF p_action = 'streak' THEN
    IF v_daily.streak_claimed THEN RAISE EXCEPTION 'Bạn đã nhận quà streak hôm nay.'; END IF;
    SELECT current_streak INTO v_streak FROM public.learning_streaks
      WHERE user_id = v_user AND last_checkin_date = v_day;
    IF coalesce(v_streak, 0) < 1 THEN RAISE EXCEPTION 'Hãy điểm danh trước khi nhận quà streak.'; END IF;
    v_day_in_cycle := (v_streak - 1) % 7 + 1;
    IF v_day_in_cycle IN (3,7) THEN
      v_chest := CASE WHEN v_day_in_cycle = 3 THEN 'silver' ELSE 'gold' END;
      v_kind := 'chest';
      v_reward := jsonb_build_object('kind','chest','title',format('Điểm danh ngày %s',v_day_in_cycle),
        'description',format('Đã nhận 1 Rương %s.',CASE WHEN v_chest = 'silver' THEN 'bạc' ELSE 'vàng' END),
        'chestTier',v_chest);
    ELSE
      v_amount := CASE v_day_in_cycle WHEN 1 THEN 15 WHEN 2 THEN 20 WHEN 4 THEN 30
        WHEN 5 THEN 40 ELSE 50 END;
      v_kind := 'coins';
      v_reward := jsonb_build_object('kind','coins','title',format('Điểm danh ngày %s',v_day_in_cycle),
        'description',format('Bạn nhận %s xu!',v_amount),'amount',v_amount);
    END IF;
    UPDATE public.flytiee_daily_events SET streak_claimed = true
      WHERE user_id = v_user AND event_date = v_day;
    v_source := 'streak'; v_reference := v_day::TEXT;

  ELSIF p_action = 'study' THEN
    IF p_payload ->> 'minutes' IS NULL OR p_payload ->> 'minutes' NOT IN ('15','45','90') THEN
      RAISE EXCEPTION 'Mốc học không hợp lệ.';
    END IF;
    v_minutes := (p_payload ->> 'minutes')::INTEGER;
    IF v_minutes = ANY(v_daily.study_claimed_milestones) THEN
      RAISE EXCEPTION 'Mốc học này đã được nhận.';
    END IF;
    SELECT floor(coalesce(seconds, 0) / 60)::INTEGER INTO v_earned
      FROM public.user_daily_online_time WHERE user_id = v_user AND study_date = v_day;
    IF coalesce(v_earned, 0) < v_minutes THEN RAISE EXCEPTION 'Bạn chưa học đủ thời gian để nhận mốc này.'; END IF;
    IF v_minutes = 90 THEN
      v_chest := 'silver'; v_kind := 'chest';
      v_reward := jsonb_build_object('kind','chest','title','Học đủ 90 phút',
        'description','Rương bạc đã được chuyển vào kho.','chestTier','silver');
    ELSE
      v_amount := CASE WHEN v_minutes = 15 THEN 20 ELSE 50 END;
      v_kind := 'coins';
      v_reward := jsonb_build_object('kind','coins','title',format('Học đủ %s phút',v_minutes),
        'description',format('Bạn nhận %s xu!',v_amount),'amount',v_amount);
    END IF;
    UPDATE public.flytiee_daily_events SET
      study_claimed_milestones = array_append(study_claimed_milestones, v_minutes::SMALLINT)
      WHERE user_id = v_user AND event_date = v_day;
    v_source := 'study'; v_reference := v_minutes::TEXT;

  ELSIF p_action = 'practice' THEN
    SELECT least(100, coalesce(sum(greatest(1, least(4, coalesce(difficulty_level, 1))))
      FILTER (WHERE is_correct), 0))::INTEGER INTO v_earned
      FROM public.practice_progress
      WHERE user_id = v_user AND answered_at >= v_start AND answered_at < v_start + interval '1 day';
    v_amount := v_earned - v_daily.practice_coins_claimed;
    IF v_amount < 1 THEN RAISE EXCEPTION 'Hôm nay chưa có xu câu đúng mới.'; END IF;
    UPDATE public.flytiee_daily_events SET practice_coins_claimed = v_earned
      WHERE user_id = v_user AND event_date = v_day;
    v_kind := 'coins'; v_source := 'practice'; v_reference := v_day::TEXT;
    v_reward := jsonb_build_object('kind','coins','title','Thưởng câu đúng',
      'description',format('Bạn nhận %s xu từ các câu trả lời đúng hôm nay!',v_amount),'amount',v_amount);

  ELSIF p_action = 'daily_completion' THEN
    IF v_daily.completion_chest_claimed THEN RAISE EXCEPTION 'Bạn đã nhận Rương vàng hôm nay.'; END IF;
    IF NOT (v_daily.study_claimed_milestones @> ARRAY[15,45,90]::SMALLINT[])
      OR v_daily.practice_coins_claimed < 100 THEN
      RAISE EXCEPTION 'Hãy hoàn thành cả hai sự kiện ngày trước khi nhận rương.';
    END IF;
    UPDATE public.flytiee_daily_events SET completion_chest_claimed = true
      WHERE user_id = v_user AND event_date = v_day;
    v_chest := 'gold'; v_kind := 'chest'; v_source := 'daily_completion'; v_reference := v_day::TEXT;
    v_reward := jsonb_build_object('kind','chest','title','Hoàn thành trọn vẹn!',
      'description','Bạn nhận 1 Rương vàng.','chestTier','gold');

  ELSIF p_action = 'open_chest' THEN
    IF v_tier IS NULL OR v_tier NOT IN ('bronze','silver','gold') THEN RAISE EXCEPTION 'Loại rương không hợp lệ.'; END IF;
    IF coalesce((v_profile.chests ->> v_tier)::INTEGER, 0) < 1 THEN
      RAISE EXCEPTION 'Bạn không còn rương này.';
    END IF;
    UPDATE public.flytiee_profiles SET chests = jsonb_set(chests, ARRAY[v_tier],
      to_jsonb((chests ->> v_tier)::INTEGER - 1), true) WHERE user_id = v_user;
    v_roll := floor(random() * CASE v_tier WHEN 'silver' THEN 6 WHEN 'gold' THEN 7 ELSE 1 END)::INTEGER;
    IF v_tier = 'silver' AND v_roll = 5 THEN
      SELECT * INTO v_item FROM public.flytiee_catalog WHERE kind = 'accessory'
        AND chest_eligible AND NOT id = ANY(v_profile.owned_accessory_ids)
        ORDER BY random() LIMIT 1;
    ELSIF v_tier = 'gold' AND v_roll IN (4,5,6) THEN
      SELECT * INTO v_item FROM public.flytiee_catalog
        WHERE kind = CASE v_roll WHEN 4 THEN 'accessory' WHEN 5 THEN 'skin' ELSE 'set' END
          AND chest_eligible AND NOT id = ANY(CASE v_roll
            WHEN 4 THEN v_profile.owned_accessory_ids WHEN 5 THEN v_profile.owned_skin_ids
            ELSE v_profile.owned_set_ids END)
        ORDER BY random() LIMIT 1;
    END IF;
    IF v_item.id IS NOT NULL THEN
      v_kind := v_item.kind; v_reward_item := v_item.id;
      v_reward := jsonb_build_object('kind',v_kind,'title','Vật phẩm mới!',
        'description','Vật phẩm đã được thêm vào tủ đồ.','itemId',v_reward_item);
    ELSE
      v_pool := CASE v_tier WHEN 'bronze' THEN ARRAY[5,10,15,20,30]
        WHEN 'silver' THEN ARRAY[10,15,25,30,50] ELSE ARRAY[30,50,70,100] END;
      v_amount := v_pool[1 + floor(random() * array_length(v_pool, 1))::INTEGER];
      v_kind := 'coins';
      v_reward := jsonb_build_object('kind','coins','title','Rương đã mở!',
        'description',format('Bên trong có %s xu.',v_amount),'amount',v_amount);
    END IF;
    v_source := 'chest'; v_reference := v_tier;

  ELSIF p_action IN ('accessory','skin','set') THEN
    SELECT * INTO v_item FROM public.flytiee_catalog
      WHERE id = v_id AND kind = p_action;
    IF NOT FOUND THEN RAISE EXCEPTION 'Vật phẩm không hợp lệ.'; END IF;
    IF p_action = 'accessory' THEN
      IF v_profile.equipped_set_id IS NOT NULL THEN RAISE EXCEPTION 'Hãy tháo Set trước khi phối phụ kiện.'; END IF;
      v_equipped := v_profile.equipped;
      IF v_equipped ->> v_item.slot = v_id THEN
        v_equipped := v_equipped - v_item.slot;
      ELSE
        v_equipped := jsonb_set(v_equipped, ARRAY[v_item.slot], to_jsonb(v_id), true);
      END IF;
      IF NOT v_id = ANY(v_profile.owned_accessory_ids) THEN
        v_price := v_item.price;
        IF v_profile.coins < v_price THEN RAISE EXCEPTION 'Bạn chưa đủ xu để mua phụ kiện.'; END IF;
        UPDATE public.flytiee_profiles SET coins = coins - v_price,
          owned_accessory_ids = array_append(owned_accessory_ids, v_id), equipped = v_equipped
          WHERE user_id = v_user;
      ELSE
        UPDATE public.flytiee_profiles SET equipped = v_equipped WHERE user_id = v_user;
      END IF;
    ELSIF p_action = 'skin' THEN
      IF NOT v_id = ANY(v_profile.owned_skin_ids) THEN
        v_price := v_item.price;
        IF v_profile.coins < v_price THEN RAISE EXCEPTION 'Bạn chưa đủ xu để mua skin.'; END IF;
        UPDATE public.flytiee_profiles SET coins = coins - v_price,
          owned_skin_ids = array_append(owned_skin_ids, v_id), equipped_skin_id = v_id
          WHERE user_id = v_user;
      ELSE
        UPDATE public.flytiee_profiles SET equipped_skin_id = v_id WHERE user_id = v_user;
      END IF;
    ELSE
      IF NOT v_id = ANY(v_profile.owned_set_ids) THEN RAISE EXCEPTION 'Bạn chưa sở hữu Set này.'; END IF;
      UPDATE public.flytiee_profiles SET
        equipped_set_id = CASE WHEN equipped_set_id = v_id THEN NULL ELSE v_id END,
        equipped = CASE WHEN equipped_set_id = v_id THEN equipped ELSE '{}'::JSONB END
        WHERE user_id = v_user;
    END IF;
    IF v_price > 0 THEN
      v_source := 'shop'; v_kind := p_action; v_reward_item := v_id; v_reference := v_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Thao tác FlyTiee không được hỗ trợ.';
  END IF;

  IF v_xp > 0 THEN
    v_level := v_profile.level;
    v_remaining_xp := v_profile.xp + v_xp;
    WHILE v_remaining_xp >= 80 + v_level * 20 LOOP
      v_remaining_xp := v_remaining_xp - (80 + v_level * 20);
      v_level := v_level + 1;
    END LOOP;
    UPDATE public.flytiee_profiles SET level = v_level, xp = v_remaining_xp WHERE user_id = v_user;
  END IF;
  IF v_amount > 0 AND v_source <> 'shop' THEN
    UPDATE public.flytiee_profiles SET coins = coins + v_amount WHERE user_id = v_user;
  END IF;
  IF v_chest IS NOT NULL THEN
    UPDATE public.flytiee_profiles SET chests = jsonb_set(chests, ARRAY[v_chest],
      to_jsonb(coalesce((chests ->> v_chest)::INTEGER, 0) + 1), true) WHERE user_id = v_user;
  END IF;
  IF v_reward_item IS NOT NULL AND v_source = 'chest' THEN
    IF v_kind = 'accessory' THEN
      UPDATE public.flytiee_profiles SET owned_accessory_ids = array_append(owned_accessory_ids, v_reward_item)
        WHERE user_id = v_user;
    ELSIF v_kind = 'skin' THEN
      UPDATE public.flytiee_profiles SET owned_skin_ids = array_append(owned_skin_ids, v_reward_item)
        WHERE user_id = v_user;
    ELSE
      UPDATE public.flytiee_profiles SET owned_set_ids = array_append(owned_set_ids, v_reward_item)
        WHERE user_id = v_user;
    END IF;
  END IF;
  IF v_source IS NOT NULL THEN
    INSERT INTO public.flytiee_reward_logs
      (user_id, source, reward_kind, amount, chest_tier, item_id, reference_id,
       metadata)
    VALUES (v_user, v_source, v_kind,
      CASE WHEN v_source = 'shop' THEN v_price ELSE nullif(v_amount, 0) END,
      v_chest, v_reward_item, v_reference,
      jsonb_build_object('xp',v_xp,'opened_chest',CASE WHEN v_source = 'chest' THEN v_tier ELSE NULL END));
  END IF;
  RETURN jsonb_build_object('ok',true,'reward',v_reward,'state',public.flytiee_get_state());
END;
$$;

REVOKE ALL ON FUNCTION public.flytiee_get_state() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.flytiee_action(TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.flytiee_get_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.flytiee_action(TEXT, JSONB) TO authenticated;

-- The original 10/30/50/100/200-day milestone function also wrote to editable
-- auth metadata. Preserve its FlyMax/discount logic while making the SQL profile
-- its only inventory target.
CREATE OR REPLACE FUNCTION public.claim_learning_streak_milestone(
  p_milestone INTEGER, p_set_id TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user UUID := auth.uid();
  v_today DATE := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE;
  v_streak public.learning_streaks%ROWTYPE;
  v_profile public.flytiee_profiles%ROWTYPE;
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_tier TEXT;
  v_message TEXT;
  v_reward_kind TEXT;
  v_reward_amount INTEGER;
  v_reward_chest TEXT;
  v_reward_item TEXT;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok',false,'message','Bạn cần đăng nhập để nhận thưởng.');
  END IF;
  IF p_milestone IS NULL OR p_milestone NOT IN (10,30,50,80,100,150,200) THEN
    RETURN jsonb_build_object('ok',false,'message','Mốc này chưa thể nhận quà.');
  END IF;
  SELECT * INTO v_streak FROM public.learning_streaks
    WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND OR v_streak.last_checkin_date <> v_today
    OR v_streak.current_streak < p_milestone THEN
    RETURN jsonb_build_object('ok',false,'message','Bạn chưa đạt mốc streak này.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.learning_streak_claims
    WHERE user_id = v_user AND milestone = p_milestone) THEN
    RETURN jsonb_build_object('ok',false,'message','Bạn đã nhận quà mốc này rồi.');
  END IF;
  IF p_milestone = 100 AND (p_set_id IS NULL OR p_set_id NOT IN
    ('cosmic-explorer','dino-dreamer','snowy-christmas','shadow-ninja','mushroom-kingdom')) THEN
    RETURN jsonb_build_object('ok',false,'message','Hãy chọn một Set FlyTiee hợp lệ.');
  END IF;

  PERFORM public.ensure_flytiee_profile();
  SELECT * INTO v_profile FROM public.flytiee_profiles WHERE user_id = v_user FOR UPDATE;
  IF p_milestone = 10 THEN
    UPDATE public.flytiee_profiles SET coins = coins + 50 WHERE user_id = v_user;
    v_reward_kind := 'coins'; v_reward_amount := 50;
    v_message := 'Đã cộng 50 xu vào ví FlyTiee!';
  ELSIF p_milestone IN (30,50) THEN
    v_reward_chest := CASE WHEN p_milestone = 30 THEN 'silver' ELSE 'gold' END;
    UPDATE public.flytiee_profiles SET chests = jsonb_set(chests, ARRAY[v_reward_chest],
      to_jsonb(coalesce((chests ->> v_reward_chest)::INTEGER, 0) + 5), true)
      WHERE user_id = v_user;
    v_reward_kind := 'chest'; v_reward_amount := 5;
    v_message := CASE WHEN p_milestone = 30
      THEN 'Đã thêm 5 Rương bạc vào kho FlyTiee!'
      ELSE 'Đã thêm 5 Rương vàng vào kho FlyTiee!' END;
  ELSIF p_milestone = 80 THEN
    INSERT INTO public.learning_streak_discounts (user_id, expires_at)
      VALUES (v_user, now() + interval '30 days');
    v_message := 'Đã mở ưu đãi 50% trong 30 ngày cho 6 tháng, 1 năm và FlyInfinity!';
  ELSIF p_milestone = 100 THEN
    IF p_set_id = ANY(v_profile.owned_set_ids) THEN
      RETURN jsonb_build_object('ok',false,'message','Bạn đã có Set này. Hãy chọn Set khác.');
    END IF;
    UPDATE public.flytiee_profiles SET owned_set_ids = array_append(owned_set_ids, p_set_id)
      WHERE user_id = v_user;
    v_reward_kind := 'set'; v_reward_item := p_set_id;
    v_message := 'Set FlyTiee bạn chọn đã vào tủ đồ!';
  ELSIF p_milestone = 150 THEN
    SELECT account_tier, subscription_expires_at INTO v_tier, v_end
      FROM public.profiles WHERE id = v_user FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy hồ sơ tài khoản.'; END IF;
    IF v_tier <> 'flyinfinity' THEN
      v_start := GREATEST(now(), coalesce(v_end, now()));
      v_end := v_start + interval '365 days';
      UPDATE public.profiles SET account_tier = 'flymax',
        subscription_started_at = CASE
          WHEN subscription_expires_at IS NULL OR subscription_expires_at <= now()
          THEN now() ELSE coalesce(subscription_started_at, now()) END,
        subscription_expires_at = v_end WHERE id = v_user;
      INSERT INTO public.subscriptions
        (user_id, plan_code, source, status, starts_at, expires_at, metadata)
        VALUES (v_user,'flymax_yearly','admin','active',v_start,v_end,
          jsonb_build_object('source','learning_streak','milestone',150));
      v_message := 'Đã cộng thêm 365 ngày FlyMax vào tài khoản!';
    ELSE
      v_message := 'Bạn đã có FlyInfinity trọn đời; mốc 150 đã được ghi nhận.';
    END IF;
  ELSE
    UPDATE public.flytiee_profiles SET owned_set_ids = array_append(owned_set_ids, 'phoenix-dawn')
      WHERE user_id = v_user AND NOT 'phoenix-dawn' = ANY(owned_set_ids);
    v_reward_kind := 'set'; v_reward_item := 'phoenix-dawn';
    v_message := 'Phượng Hoàng Bình Minh đã được mở khóa trong tủ đồ FlyTiee!';
  END IF;

  INSERT INTO public.learning_streak_claims (user_id, milestone, selected_set_id)
    VALUES (v_user, p_milestone, CASE WHEN p_milestone = 100 THEN p_set_id
      WHEN p_milestone = 200 THEN 'phoenix-dawn' ELSE NULL END);
  IF v_reward_kind IS NOT NULL THEN
    INSERT INTO public.flytiee_reward_logs
      (user_id, source, reward_kind, amount, chest_tier, item_id, reference_id)
      VALUES (v_user,'streak',v_reward_kind,v_reward_amount,v_reward_chest,
        v_reward_item,'milestone:' || p_milestone);
  END IF;
  RETURN jsonb_build_object('ok',true,'message',v_message,'milestone',p_milestone);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_learning_streak_milestone(INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_learning_streak_milestone(INTEGER, TEXT) TO authenticated;

ALTER TABLE public.flytiee_reward_logs
  DROP CONSTRAINT IF EXISTS flytiee_reward_logs_source_check;
ALTER TABLE public.flytiee_reward_logs
  ADD CONSTRAINT flytiee_reward_logs_source_check
  CHECK (source IN ('mission','streak','study','practice','daily_completion',
    'chest','gift_code','shop','adventure'));

-- Keep the existing level-specific spin probabilities and one-spin guard;
-- credit only the locked SQL profile, never user_metadata.
CREATE OR REPLACE FUNCTION public.flytiee_adventure_spin()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user UUID := auth.uid();
  v_run public.flytiee_adventure_runs%ROWTYPE;
  v_roll INTEGER;
  v_index INTEGER;
  v_kind TEXT := 'coins';
  v_amount INTEGER;
  v_tier TEXT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Hãy đăng nhập để quay thưởng.'; END IF;
  SELECT * INTO v_run FROM public.flytiee_adventure_runs
    WHERE user_id = v_user AND play_date = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE
    FOR UPDATE;
  IF NOT FOUND OR v_run.status NOT IN ('won','claimed') THEN
    RAISE EXCEPTION 'Cần trả lời đúng cả 5 câu trước khi quay thưởng.';
  END IF;
  IF v_run.status = 'claimed' THEN RETURN to_jsonb(v_run); END IF;

  v_roll := floor(random() * 100)::INTEGER;
  IF v_run.level = 1 THEN
    v_index := CASE WHEN v_roll < 40 THEN 0 WHEN v_roll < 75 THEN 1
      WHEN v_roll < 95 THEN 2 ELSE 3 END;
    IF v_index = 3 THEN v_kind := 'chest'; v_tier := 'bronze';
    ELSE v_amount := (ARRAY[10,15,20])[v_index + 1]; END IF;
  ELSIF v_run.level = 2 THEN
    v_index := CASE WHEN v_roll < 35 THEN 0 WHEN v_roll < 65 THEN 1
      WHEN v_roll < 85 THEN 2 WHEN v_roll < 97 THEN 3 ELSE 4 END;
    IF v_index >= 3 THEN v_kind := 'chest';
      v_tier := CASE WHEN v_index = 3 THEN 'bronze' ELSE 'silver' END;
    ELSE v_amount := (ARRAY[15,25,35])[v_index + 1]; END IF;
  ELSE
    v_index := CASE WHEN v_roll < 30 THEN 0 WHEN v_roll < 60 THEN 1
      WHEN v_roll < 80 THEN 2 WHEN v_roll < 92 THEN 3
      WHEN v_roll < 99 THEN 4 ELSE 5 END;
    IF v_index >= 3 THEN v_kind := 'chest';
      v_tier := (ARRAY['bronze','silver','gold'])[v_index - 2];
    ELSE v_amount := (ARRAY[20,30,45])[v_index + 1]; END IF;
  END IF;

  PERFORM public.ensure_flytiee_profile();
  IF v_kind = 'coins' THEN
    UPDATE public.flytiee_profiles SET coins = coins + v_amount WHERE user_id = v_user;
  ELSE
    UPDATE public.flytiee_profiles SET chests = jsonb_set(chests, ARRAY[v_tier],
      to_jsonb(coalesce((chests ->> v_tier)::INTEGER, 0) + 1), true)
      WHERE user_id = v_user;
  END IF;
  UPDATE public.flytiee_adventure_runs
    SET status = 'claimed', reward_kind = v_kind, reward_amount = v_amount,
      reward_chest_tier = v_tier, reward_index = v_index, updated_at = now()
    WHERE id = v_run.id RETURNING * INTO v_run;
  INSERT INTO public.flytiee_reward_logs
    (user_id, source, reward_kind, amount, chest_tier, reference_id)
    VALUES (v_user,'adventure',v_kind,v_amount,v_tier,v_run.id::TEXT);
  RETURN to_jsonb(v_run);
END;
$$;
REVOKE ALL ON FUNCTION public.flytiee_adventure_spin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.flytiee_adventure_spin() TO authenticated;

COMMIT;
