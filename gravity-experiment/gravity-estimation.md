# Estimating Gravitational Acceleration

## No-delay model (Delay model off)

Suppose each observed time satisfies

$$
t_i = \sqrt{\frac{2x_i}{g}} + e_i,
$$

where:

- $x_i$ is the known distance,
- $t_i$ is the observed time,
- $g$ is gravitational acceleration, and
- $e_i$ is additive timing noise with $\operatorname{E}[e_i]=0$.

Define

$$
u_i = \sqrt{x_i}
\qquad\text{and}\qquad
b = \sqrt{\frac{2}{g}}.
$$

The model becomes a linear regression through the origin:

$$
t_i = b u_i + e_i.
$$

The least-squares estimate of $b$ is

$$
\widehat b_0
= \frac{\sum_i u_i t_i}{\sum_i u_i^2}
= \frac{\sum_i \sqrt{x_i}\,t_i}{\sum_i x_i}.
$$

Because $b^2=2/g$, the gravity estimate is

$$
\boxed{\widehat g = \frac{2}{\widehat b_0^{\,2}}}.
$$

Equivalently, define $z_i=\sqrt{2x_i}$ and $\theta=1/\sqrt{g}$. Then

$$
t_i = \theta z_i + e_i,
$$

$$
\widehat\theta
= \frac{\sum_i z_i t_i}{\sum_i z_i^2},
\qquad
\boxed{\widehat g=\frac{1}{\widehat\theta^{\,2}}}.
$$

## Fitted curves shown by the experiment

With **Delay model** off, the graph displays

$$
\boxed{x=\frac{1}{2}\widehat g\,t_{\mathrm{obs}}^2}.
$$

With **Delay model** on, the observed-time model includes a shared reaction-time intercept:

$$
t_i=\delta+b\sqrt{x_i}+e_i.
$$

Ordinary least squares estimates

$$
\widehat b
=\frac{\sum_i (u_i-\overline u)(t_i-\overline t)}
       {\sum_i (u_i-\overline u)^2},
\qquad
\widehat\delta=\overline t-\widehat b\,\overline u,
$$

where $u_i=\sqrt{x_i}$. Gravity is again

$$
\widehat g=\frac{2}{\widehat b^2},
$$

and the graph displays

$$
\boxed{x=\frac{1}{2}\widehat g\left(t_{\mathrm{obs}}-\widehat\delta\right)^2}.
$$

## Multiple trials

All observations from all completed trials are pooled under the selected model. With Delay model off,

$$
t_{ij}=b\sqrt{x_{ij}}+e_{ij},
$$

and the shared slope estimate is

$$
\widehat b
=
\frac{
\sum_j\sum_i \sqrt{x_{ij}}\,t_{ij}
}{
\sum_j\sum_i x_{ij}
},
$$

followed by

$$
\boxed{\widehat g=\frac{2}{\widehat b^{\,2}}}.
$$

With Delay model on, the pooled observations instead use one shared intercept $\delta$ and the centered OLS formulas above.

## Standard error and two-standard-error range

For the through-origin fit,

$$
\operatorname{SSE}_0
=\sum_i\left(t_i-\widehat b\sqrt{x_i}\right)^2,
\qquad
\widehat\sigma_0^2=\frac{\operatorname{SSE}_0}{n-1},
$$

and

$$
\operatorname{SE}_0(\widehat b)
=\sqrt{\frac{\widehat\sigma_0^2}{\sum_i x_i}}.
$$

For the delay fit,

$$
\operatorname{SSE}_\delta
=\sum_i\left(t_i-\widehat\delta-\widehat b\sqrt{x_i}\right)^2,
\qquad
\widehat\sigma_\delta^2=\frac{\operatorname{SSE}_\delta}{n-2},
$$

and

$$
\operatorname{SE}_\delta(\widehat b)
=\sqrt{
\frac{\widehat\sigma_\delta^2}
{\sum_i\left(\sqrt{x_i}-\overline{\sqrt{x}}\right)^2}
}.
$$

The selected slope standard error is then propagated to gravity.

Using the delta method with $g=2/b^2$ gives

$$
\operatorname{SE}(\widehat g)
\approx
\left|\frac{d}{db}\frac{2}{b^2}\right|_{b=\widehat b}
\operatorname{SE}(\widehat b)
=
\frac{4}{\widehat b^3}\operatorname{SE}(\widehat b).
$$

The reported range is centered on $\widehat g$:

$$
\boxed{
\left[
\widehat g-2\operatorname{SE}(\widehat g),
\widehat g+2\operatorname{SE}(\widehat g)
\right]
}.
$$

This is a delta-method uncertainty range; under the Gaussian error model it is an approximate 95% range rather than an exact finite-sample interval.

## Equivalent direct model

With independent Gaussian timing noise, the two switch states correspond to

$$
t_i \sim \mathcal N\left(\sqrt{\frac{2x_i}{g}},\sigma\right)
$$

and

$$
t_i \sim \mathcal N\left(\delta+\sqrt{\frac{2x_i}{g}},\sigma\right).
$$

In either case, the linearized least-squares estimate and the direct maximum-likelihood estimate of $g$ are equivalent because $b=\sqrt{2/g}$ is an exact one-to-one reparameterization.
