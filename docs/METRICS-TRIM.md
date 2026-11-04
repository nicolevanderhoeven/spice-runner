# Prometheus metric trimming (drop at scrape time)

The in-cluster Prometheus (`k8s/observability-stack.yaml`, ConfigMap `prometheus-config`) forwards its whole TSDB to Grafana Cloud with `remote_write` and has no `write_relabel_configs`. Most of what it stores is cadvisor, kube-state-metrics and Kepler detail that no dashboard, KEDA trigger or alert reads.

Seven scrape jobs now carry a `metric_relabel_configs` `drop` rule. Dropped series are never written to the local TSDB, so they are never forwarded either: the in-cluster copy and the Grafana Cloud copy shrink together. `up` and `scrape_*` series are not affected by `metric_relabel_configs` and are always kept.

## Series before and after

Counted with read-only PromQL on 2026-11-04 (`count({job="<job>"})`, and `count by (__name__)` for each rule below). "After" is the same count minus the series the new regexes match.

| Job | Series now | Dropped | Series after |
|---|---:|---:|---:|
| `kubernetes-cadvisor` | 19,042 | 15,380 | 3,662 |
| `kube-state-metrics` | 7,622 | 4,555 | 3,067 |
| `kepler` | 2,718 | 2,211 | 507 |
| `alloy` | 2,332 | 1,360 | 972 |
| `prometheus` | 1,131 | 379 | 752 |
| `kubernetes-pods` | 1,524 | 864 | 660 |
| `keda-metrics-apiserver` | 958 | 864 | 94 |
| Other jobs, unchanged at measurement time (`keda-operator`, `kubernetes-nodes`, `nginx`; see "Scrape target fixes" below) | 98 | 0 | 98 |
| **Total** | **35,425** | **25,613** | **9,812** |

That is about 72% fewer active series. `prometheus_tsdb_head_series` read about 116k during the earlier assessment and 35.6k when I measured; the head count includes series from pods and nodes that have since gone away, so it swings with scale-up and scale-down. The 35,425 above is the number of series with a recent sample.

`kubernetes-pods` and `keda-metrics-apiserver` both scrape the same KEDA metrics-apiserver pod (its pod carries `prometheus.io/scrape` annotations, so the `kubernetes-pods` job picks it up as well), so the same 864 framework series appear under both job labels. Both jobs get the rule. The duplicate scrape itself is left alone.

## What is kept, and who uses it

Every metric below is still collected. These are the only metrics read by any dashboard (the four dashboards the in-cluster Grafana mounts, the unmounted nginx dashboard and `working-dashboard` ConfigMaps, `grafana/dashboards/spice-runner-overview.json` and `grafana-dashboards/leaderboard-observability.json`) or by KEDA:

- **KEDA**: `nginx_http_requests_total` (the `spice-runner-keda` Prometheus trigger). The cpu and memory triggers read the metrics server, not Prometheus.
- **cadvisor**: `container_cpu_usage_seconds_total`, `container_memory_working_set_bytes`, `container_network_receive_bytes_total`, `container_network_transmit_bytes_total`
- **kube-state-metrics**: `kube_node_info`, `kube_node_status_condition`, `kube_node_status_allocatable`, `kube_pod_info`, `kube_pod_status_phase`, `kube_pod_container_resource_requests`, `kube_pod_container_resource_limits`, `kube_pod_container_status_restarts_total`, `kube_deployment_status_replicas`, `kube_deployment_created`, `kube_statefulset_created`, `kube_daemonset_created`, `kube_service_info`, `kube_persistentvolumeclaim_info`, and the `kube_horizontalpodautoscaler_*` min/max/current/desired/condition series
- **Kepler**: `kepler_container_joules_total`, `kepler_node_platform_joules_total`
- **App and Alloy**: `http_server_requests_total`, `http_server_request_duration_seconds_bucket`, `db_query_duration_seconds_bucket`, `redis_operation_duration_seconds_bucket`, `cache_hits_total`, `cache_misses_total`, `score_submissions_total`, `score_submission_errors_total`, `nginx_http_requests_total`, `alloy_build_info`, `alloy_component_controller_running_components`, `alloy_config_last_load_successful`
- Referenced by a dashboard but not emitted by this cluster today (nothing to keep or drop): `node_cpu_seconds_total` and `node_memory_*` (there is no node-exporter). `keda_scaler_metrics_value` (the "KEDA Desired" series) is collected again now that the `keda-operator` job scrapes `:8080` (see "Scrape target fixes").

Also kept: everything else that was not named below (for example network errors and drops, CFS throttling, OOM events, memory usage/rss/cache, filesystem usage, `kube_pod_owner`, `kube_pod_status_ready`, container ready/running/waiting/terminated, deployment replica and availability counts, node and node-capacity metrics, Kepler node-level energy, `keda_*`, `process_*` and the small `go_*` gauges).

Prometheus has no `rule_files` (no recording or alerting rules), and the repo provisions no Grafana alert rules. Alerts someone created by hand in the in-cluster Grafana UI cannot be listed without logging in; that Grafana keeps its state on `emptyDir`, so any such rule would not survive a pod restart.

## What is dropped

### `kubernetes-cadvisor` (19,042 series, 15,380 dropped)

| Family group | Series | What it is | Metric names |
|---|---:|---|---|
| task states | 1,575 | Per-container count of tasks in each scheduler state (running/sleeping/stopped/...) | `container_tasks_state` |
| memory fault counters | 1,260 | Per-container page-fault counters (pgfault/pgmajfault x container/hierarchy scope) | `container_memory_failures_total` |
| block I/O per device | 704 | Per-container, per-device, per-operation block I/O bytes | `container_blkio_device_usage_total` |
| filesystem I/O and inodes | 2,668 | Per-container filesystem reads/writes/IO time/inodes/limit by device (container_fs_usage_bytes is kept) | `container_fs_inodes_free`, `container_fs_inodes_total`, `container_fs_io_current`, `container_fs_io_time_seconds_total`, `container_fs_io_time_weighted_seconds_total`, `container_fs_limit_bytes`, `container_fs_read_seconds_total`, `container_fs_reads_bytes_total`, `container_fs_reads_merged_total`, `container_fs_reads_total`, `container_fs_sector_reads_total`, `container_fs_sector_writes_total`, `container_fs_write_seconds_total`, `container_fs_writes_bytes_total`, `container_fs_writes_merged_total`, `container_fs_writes_total` |
| pressure stall (PSI) | 1,890 | Per-container Linux pressure-stall seconds for cpu, memory and io | `container_pressure_cpu_stalled_seconds_total`, `container_pressure_cpu_waiting_seconds_total`, `container_pressure_io_stalled_seconds_total`, `container_pressure_io_waiting_seconds_total`, `container_pressure_memory_stalled_seconds_total`, `container_pressure_memory_waiting_seconds_total` |
| deprecated CPU load average | 630 | 10s CPU load average (deprecated; unreliable on cgroup v2) | `container_cpu_load_average_10s`, `container_cpu_load_d_average_10s` |
| CPU user/system split and CFS burst | 776 | User/system split of CPU time and CFS burst counters (container_cpu_usage_seconds_total and the throttling counters are kept) | `container_cpu_cfs_burst_periods_total`, `container_cpu_cfs_burst_seconds_total`, `container_cpu_system_seconds_total`, `container_cpu_user_seconds_total` |
| static cgroup spec values | 1,260 | Static cgroup settings (container_spec_memory_limit_bytes is kept) | `container_spec_cpu_period`, `container_spec_cpu_shares`, `container_spec_memory_reservation_limit_bytes`, `container_spec_memory_swap_limit_bytes` |
| process, thread, socket and fd gauges | 2,412 | Per-container counts of sockets/processes/threads/fds, ulimits, health state, last-seen timestamp | `container_file_descriptors`, `container_health_state`, `container_last_seen`, `container_processes`, `container_sockets`, `container_threads`, `container_threads_max`, `container_ulimits_soft` |
| memory breakdown gauges | 2,205 | Finer memory breakdown (working set, usage, rss and cache are kept) | `container_memory_failcnt`, `container_memory_kernel_usage`, `container_memory_mapped_file`, `container_memory_max_usage_bytes`, `container_memory_swap`, `container_memory_total_active_file_bytes`, `container_memory_total_inactive_file_bytes` |

### `kube-state-metrics` (7,622 series, 4,555 dropped)

| Family group | Series | What it is | Metric names |
|---|---:|---|---|
| pod scheduling detail | 1,934 | Per-pod tolerations, status reason, QoS class, timestamps, IPs, restart policy, service account | `kube_pod_created`, `kube_pod_ips`, `kube_pod_restart_policy`, `kube_pod_service_account`, `kube_pod_start_time`, `kube_pod_status_container_ready_time`, `kube_pod_status_initialized_time`, `kube_pod_status_qos_class`, `kube_pod_status_ready_time`, `kube_pod_status_reason`, `kube_pod_status_scheduled`, `kube_pod_status_scheduled_time`, `kube_pod_tolerations` |
| ReplicaSets | 1,160 | Per-ReplicaSet replica counts/generation/owner (one set per rollout, so churns; Deployment-level metrics are kept) | `kube_replicaset_created`, `kube_replicaset_metadata_generation`, `kube_replicaset_owner`, `kube_replicaset_spec_replicas`, `kube_replicaset_status_fully_labeled_replicas`, `kube_replicaset_status_observed_generation`, `kube_replicaset_status_ready_replicas`, `kube_replicaset_status_replicas` |
| container info and start state | 254 | Per-container image/id labels and start timestamp (restarts, ready, running, waiting and terminated are kept) | `kube_pod_container_info`, `kube_pod_container_state_started` |
| init containers | 357 | Per-init-container info/ready/state/restarts/resources | `kube_pod_init_container_info`, `kube_pod_init_container_resource_limits`, `kube_pod_init_container_resource_requests`, `kube_pod_init_container_status_ready`, `kube_pod_init_container_status_restarts_total`, `kube_pod_init_container_status_running`, `kube_pod_init_container_status_terminated`, `kube_pod_init_container_status_terminated_reason`, `kube_pod_init_container_status_waiting` |
| ConfigMaps, Secrets and Endpoints | 367 | Object info/created/resource-version series for every ConfigMap, Secret and Endpoints object | `kube_configmap_created`, `kube_configmap_info`, `kube_configmap_metadata_resource_version`, `kube_endpoint_address`, `kube_endpoint_address_available`, `kube_endpoint_address_not_ready`, `kube_endpoint_created`, `kube_endpoint_info`, `kube_endpoint_ports`, `kube_secret_created`, `kube_secret_info`, `kube_secret_metadata_resource_version`, `kube_secret_type` |
| Deployment, DaemonSet, Service, Namespace, Node, HPA bookkeeping | 483 | Generation counters, rollout-strategy settings and created timestamps (replica counts, availability and the *_created/info series dashboards use are kept) | `kube_daemonset_metadata_generation`, `kube_daemonset_status_current_number_scheduled`, `kube_daemonset_status_number_misscheduled`, `kube_daemonset_status_observed_generation`, `kube_daemonset_status_updated_number_scheduled`, `kube_deployment_metadata_generation`, `kube_deployment_spec_paused`, `kube_deployment_spec_strategy_rollingupdate_max_surge`, `kube_deployment_spec_strategy_rollingupdate_max_unavailable`, `kube_deployment_status_condition`, `kube_deployment_status_observed_generation`, `kube_horizontalpodautoscaler_metadata_generation`, `kube_namespace_created`, `kube_node_created`, `kube_service_created`, `kube_service_spec_type` |

### `kepler` (2,718 series, 2,211 dropped)

| Family group | Series | What it is | Metric names |
|---|---:|---|---|
| per-container power components | 1,206 | Per-container energy split by RAPL domain (kepler_container_joules_total, the total, is kept) | `kepler_container_core_joules_total`, `kepler_container_dram_joules_total`, `kepler_container_other_joules_total`, `kepler_container_package_joules_total`, `kepler_container_platform_joules_total`, `kepler_container_uncore_joules_total` |
| eBPF counters | 1,005 | Per-container eBPF counters used to attribute energy (CPU time, IRQs, page-cache hits) | `kepler_container_bpf_block_irq_total`, `kepler_container_bpf_cpu_time_ms_total`, `kepler_container_bpf_net_rx_irq_total`, `kepler_container_bpf_net_tx_irq_total`, `kepler_container_bpf_page_cache_hit_total` |

### `alloy` (2,332 series, 1,360 dropped)

| Family group | Series | What it is | Metric names |
|---|---:|---|---|
| histogram buckets | 1,360 | Alloy self-metric latency/size histogram buckets (their _sum and _count are kept) | 24 metric names, e.g. `alloy_component_dependencies_wait_seconds_bucket`, `alloy_component_evaluation_seconds_bucket`, `faro_receiver_request_duration_seconds_bucket`, `faro_receiver_request_message_bytes_bucket`, `faro_receiver_response_message_bytes_bucket` |

### `prometheus` (1,131 series, 379 dropped)

| Family group | Series | What it is | Metric names |
|---|---:|---|---|
| histogram buckets | 379 | Prometheus self-metric histogram buckets (_sum and _count kept) | 25 metric names, e.g. `go_gc_heap_allocs_by_size_bytes_bucket`, `go_gc_heap_frees_by_size_bytes_bucket`, `go_gc_pauses_seconds_bucket`, `go_sched_latencies_seconds_bucket`, `go_sched_pauses_stopping_gc_seconds_bucket` |

### `kubernetes-pods` (1,524 series, 864 dropped)

Same rule and same 864 series as `keda-metrics-apiserver` (see above).

### `keda-metrics-apiserver` (958 series, 864 dropped)

| Family group | Series | What it is | Metric names |
|---|---:|---|---|
| keda/k8s-apiserver framework metrics | 864 | Generic Kubernetes API-server-library, workqueue and Go-runtime internals emitted by the KEDA metrics-apiserver (keda_* metrics, process_* and the basic go_* gauges are kept) | 154 metric names, e.g. `apiserver_audit_event_total`, `apiserver_audit_requests_rejected_total`, `apiserver_client_certificate_expiration_seconds_bucket`, `apiserver_client_certificate_expiration_seconds_count`, `apiserver_client_certificate_expiration_seconds_sum` |

## What you lose

- Per-container filesystem and block I/O rates, pressure-stall (PSI) metrics, task/thread/socket counts, and the finer memory breakdown. If you need to debug a noisy-neighbour or disk problem, re-enable `container_fs_*`, `container_blkio_*` or `container_pressure_*` by deleting that name from the regex.
- Per-component Kepler power (dram/core/package/uncore) and eBPF counters. Total container power and node platform power remain, which is all the Kepler dashboard reads.
- Latency histogram buckets for Alloy and Prometheus internals. Their `_sum` and `_count` remain, so average latencies still work.
- ReplicaSet, ConfigMap, Secret, Endpoints, init-container and pod-scheduling detail from kube-state-metrics. Deployment, pod, node, HPA and service state remain.
- Nothing in the app, nginx, KEDA or leaderboard metrics is touched.

## Applying and reverting

Prometheus has no `--web.enable-lifecycle`, so a ConfigMap change takes effect when the Prometheus pod restarts:

```bash
kubectl apply -f k8s/observability-stack.yaml
kubectl rollout restart deployment/prometheus -n observability
```

The restart is a short gap in scraping, and KEDA's request-rate trigger reads this Prometheus, so apply it during a quiet period. Series that were already stored stay in the local TSDB until they age out (and in Grafana Cloud until its retention), so the counts fall over the retention window rather than instantly. The active series count drops as soon as the new config scrapes.

To check the result after applying:

```promql
count({__name__=~".+"})
count by (job) ({__name__=~".+"})
```

To bring a family back, remove its name from the relevant `regex` in `prometheus-config` and restart Prometheus.

## Scrape target fixes (2026-11-04)

Ten targets had been `up == 0`; none fed a dashboard, KEDA trigger or alert. Three scrape-config mistakes:

- `kubernetes-nodes` (7 targets): removed. It spoke plain HTTP to the kubelet's HTTPS port 10250 (HTTP 400), so it had never worked. Node CPU, memory and network come from `kubernetes-cadvisor`; node health from `kube_node_status_condition`.
- `keda-operator` (1 target): now scrapes `:8080`, the real Prometheus endpoint (`:9666` is KEDA's gRPC metricsservice port and always returned EOF). A `keep` rule retains only `keda_(scaler|scaled_object|trigger|resource|build|internal_scale).*`; the rest of `:8080` is Go runtime and controller-runtime framework series, and `keda_internal_metricsservice_grpc_*` already arrive via `keda-metrics-apiserver`. This brings back `keda_scaler_metrics_value`, which the "KEDA Desired" panel reads.
- `kube-dns` pods (2 targets, job `kubernetes-pods`): dropped by a first relabel rule on `k8s_app=kube-dns`. GKE moved kube-dns to CoreDNS (metrics on `:9153`) but the pods still advertise the legacy `:10054` port.

`kubernetes-cadvisor`, `kube-state-metrics`, `kepler` and the other jobs are unchanged.
