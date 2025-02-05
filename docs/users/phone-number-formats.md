# Alternative phone number formats

In order to match a call to a contact in a CRM, App Connect needs to search the CRM for a contact using a phone number. Some CRMs have more rudimentary APIs that require phone numbers to EXACTLY match the string searched for. For these CRMs, reliably finding a contact record for a phone number can be difficult, which in turn impacts your ability to log a call and associate it with the proper entity in your CRM. Let's look at an example to help you understand. The following phone numbers are all functionally equivalent, even though they are not literally identical. 

* `(###) ###-####`
* `###.###.####`
* `###-###-####`
* `+1-###-###-####`
* etc

<figure markdown>
  ![Overriding formats in settings](../img/overriding-format-setup.png){ .mw-300 }
  <figcaption>A setting used to search for contacts using a variety of alternative formats used by the customer.</figcaption>
</figure>

RingCentral phone numbers are all formatted using the [E.164 standard](https://en.wikipedia.org/wiki/E.164). If you are not storing phone numbers that utilize this format, and if your particular CRM does not support a more rigorous search mechanism, App Connect may fail to associate calls with contacts properly. 

Those CRMs that exhibit this problem have additional settings found under the "Contacts" setting area. These phone number format parameters allows you to specify multiple formats used by your team. App Connect will then search for contacts using each of the formats provided until a record is found. This may have performance impacts.

CRMs known to exhibit this problem are:

* Clio
* Insightly 
* NetSuite

