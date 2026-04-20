
-- ============ ROLES ============
CREATE TYPE public.app_role AS ENUM ('admin', 'viewer');

CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Auto-assign admin role to the first user that signs up
CREATE OR REPLACE FUNCTION public.assign_first_user_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_assign_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.assign_first_user_admin();

-- ============ TIMESTAMP HELPER ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============ SERVERS ============
CREATE TABLE public.servers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  hostname TEXT,
  description TEXT,
  ingest_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status TEXT NOT NULL DEFAULT 'pending', -- pending | online | offline
  last_seen_at TIMESTAMPTZ,
  os TEXT,
  agent_version TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage servers"
  ON public.servers FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Viewers can read servers"
  ON public.servers FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'viewer') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_servers_updated_at
  BEFORE UPDATE ON public.servers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ SERVER METRICS (timeseries) ============
CREATE TABLE public.server_metrics (
  id BIGSERIAL PRIMARY KEY,
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cpu_percent NUMERIC,
  ram_percent NUMERIC,
  ram_used_mb NUMERIC,
  ram_total_mb NUMERIC,
  disk_percent NUMERIC,
  disk_used_gb NUMERIC,
  disk_total_gb NUMERIC,
  net_rx_bytes BIGINT,
  net_tx_bytes BIGINT,
  load_1 NUMERIC,
  load_5 NUMERIC,
  load_15 NUMERIC,
  uptime_seconds BIGINT
);

CREATE INDEX idx_server_metrics_server_time ON public.server_metrics (server_id, recorded_at DESC);

ALTER TABLE public.server_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read metrics"
  ON public.server_metrics FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'viewer'));

-- ============ DOCKER CONTAINERS (current snapshot) ============
CREATE TABLE public.docker_containers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  container_id TEXT NOT NULL,
  name TEXT NOT NULL,
  image TEXT,
  status TEXT,
  state TEXT,
  cpu_percent NUMERIC,
  ram_mb NUMERIC,
  restart_count INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (server_id, container_id)
);

CREATE INDEX idx_docker_containers_server ON public.docker_containers (server_id);

ALTER TABLE public.docker_containers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read containers"
  ON public.docker_containers FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'viewer'));

-- ============ HTTP CHECKS CONFIG ============
CREATE TABLE public.http_checks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'GET',
  expected_status INTEGER NOT NULL DEFAULT 200,
  timeout_ms INTEGER NOT NULL DEFAULT 10000,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.http_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage http_checks"
  ON public.http_checks FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Viewers read http_checks"
  ON public.http_checks FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'viewer') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_http_checks_updated_at
  BEFORE UPDATE ON public.http_checks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ HTTP CHECK RESULTS (timeseries) ============
CREATE TABLE public.http_check_results (
  id BIGSERIAL PRIMARY KEY,
  check_id UUID NOT NULL REFERENCES public.http_checks(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status_code INTEGER,
  response_time_ms INTEGER,
  success BOOLEAN NOT NULL,
  error TEXT
);

CREATE INDEX idx_http_results_check_time ON public.http_check_results (check_id, recorded_at DESC);

ALTER TABLE public.http_check_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read http_check_results"
  ON public.http_check_results FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'viewer'));

-- ============ CONTAINER LOGS (recent errors) ============
CREATE TABLE public.container_logs (
  id BIGSERIAL PRIMARY KEY,
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  container_name TEXT NOT NULL,
  level TEXT, -- error | warn | info
  message TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_container_logs_server_time ON public.container_logs (server_id, recorded_at DESC);

ALTER TABLE public.container_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read container_logs"
  ON public.container_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'viewer'));

-- ============ ALERTS ============
CREATE TABLE public.alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  server_id UUID REFERENCES public.servers(id) ON DELETE CASCADE,
  http_check_id UUID REFERENCES public.http_checks(id) ON DELETE CASCADE,
  severity TEXT NOT NULL DEFAULT 'warning', -- info | warning | critical
  title TEXT NOT NULL,
  message TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alerts_created ON public.alerts (created_at DESC);

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage alerts"
  ON public.alerts FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Viewers read alerts"
  ON public.alerts FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'viewer') OR public.has_role(auth.uid(), 'admin'));

-- ============ REALTIME ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.servers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.server_metrics;
ALTER PUBLICATION supabase_realtime ADD TABLE public.docker_containers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.http_check_results;
