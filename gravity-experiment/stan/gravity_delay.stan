// Model 2: constant reaction delay
//
//   t_i = delta + sqrt(2 * x_i / g) + eps_i,   eps_i ~ normal(0, sigma)
//
// delta is a shared timing offset (e.g. human reaction time).

data {
  int<lower=1> N;
  vector<lower=0>[N] x;   // drop distances (m)
  vector<lower=0>[N] t;   // observed fall times (s)
}
transformed data {
  real log5 = log(5);     // 5 m/s^2 is the mean of the prior on g
}
parameters {
  real<lower=0> g;        // gravitational acceleration (m/s^2)
  real<lower=0> delta;    // shared reaction delay (s)
  real<lower=0> sigma;    // residual timing noise sd (s)
}
model {
  g ~ lognormal(log5, 0.2);
  delta ~ normal(0.2, 0.2); // human reaction time is ~0.2 s
  sigma ~ normal(0, 0.5);
  t ~ normal(delta + sqrt(2 * x / g), sigma);
}
generated quantities {
  real theta = inv_sqrt(g);
  vector[N] t_rep;

  for (n in 1:N)
    t_rep[n] = normal_rng(delta + sqrt(2 * x[n] / g), sigma);
}
