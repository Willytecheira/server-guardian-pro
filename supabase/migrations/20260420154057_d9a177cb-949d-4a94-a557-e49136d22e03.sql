-- Alert rules (global)
CREATE TABLE public.alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric text NOT NULL CHECK (metric IN ('cpu_percent','ram_percent','disk_percent','offline')),
  operator text NOT NULL DEFAULT '>' CHECK (operator IN ('>','>=','<','<=','=')),
  threshold numeric NOT NULL DEFAULT 0,
  duration_minutes integer NOT NULL DEFAULT 5,
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  enabled boolean NOT NULL DEFAULT true,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage alert_rules" ON public.alert_rules
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Viewers read alert_rules" ON public.alert_rules
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer') OR has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_alert_rules_updated
  BEFORE UPDATE ON public.alert_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Notification settings (singleton)
CREATE TABLE public.notification_settings (
  id int PRIMARY KEY CHECK (id = 1),
  telegram_chat_id text,
  telegram_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage notification_settings" ON public.notification_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Viewers read notification_settings" ON public.notification_settings
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer') OR has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_notification_settings_updated
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.notification_settings (id, telegram_enabled) VALUES (1, false);

-- Default rules
INSERT INTO public.alert_rules (metric, operator, threshold, duration_minutes, severity, name) VALUES
  ('cpu_percent','>',90,5,'warning','CPU alta (>90% por 5 min)'),
  ('ram_percent','>',90,5,'warning','RAM alta (>90% por 5 min)'),
  ('disk_percent','>',85,5,'warning','Disco alto (>85% por 5 min)'),
  ('offline','>',2,0,'critical','Servidor offline (>2 min sin reportar)');

-- Helper to track last alert per (server, rule) to avoid spam
CREATE TABLE public.alert_rule_state (
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES public.alert_rules(id) ON DELETE CASCADE,
  triggered_at timestamptz,
  last_alert_id uuid REFERENCES public.alerts(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, rule_id)
);

ALTER TABLE public.alert_rule_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read alert_rule_state" ON public.alert_rule_state
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'viewer'));