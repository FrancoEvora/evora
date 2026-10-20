alter table public.aurora_sources drop constraint aurora_sources_source_key_check;
alter table public.aurora_sources add constraint aurora_sources_source_key_check check(source_key in ('ibge_census','ibge_population','ibge_gdp','ibge_sinapi','ibge_custom','bcb_selic','bcb_ipca','anm_mining','ibama','icmbio','incra','sinisa','inde','municipality','caged','inep','cnes','mapbiomas'));
