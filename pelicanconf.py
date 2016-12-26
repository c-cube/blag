#!/usr/bin/env python
# -*- coding: utf-8 -*- #

AUTHOR = u"Simon, Vincent & Vincent"
AUTHOR_URL = u"author/{name}.html"
SITENAME = u"the blAAAAAAAg"
SITEURL = 'https://cedeela.fr'

# rss and atom

FEED_DOMAIN = SITEURL
FEED_ALL_RSS = 'feeds/all.rss.xml'

# bleh
#DISQUS_SITENAME = "cedeelafr"

TIMEZONE = 'Europe/Paris'

DEFAULT_LANG = 'en'

# Blogroll
LINKS =   (('Pelican', 'http://docs.notmyidea.org/alexis/pelican/'),
           ('OCaml reddit', 'http://www.reddit.com/r/ocaml/'),
           ('Simon\'s github', 'https://github.com/c-cube'),
           ('Gagallium (Gallium\'s blog)', 'http://gallium.inria.fr/blog/'),
          )
#LINKS =  (('Pelican', 'http://docs.notmyidea.org/alexis/pelican/'),
#          ('Python.org', 'http://python.org'),
#          ('Jinja2', 'http://jinja.pocoo.org'),
#         )

# Social widget
SOCIAL = (
         )
#SOCIAL = (('You can add links in your config file', '#'),
#          ('Another social link', '#'),)

DEFAULT_PAGINATION = 10

#THEME = u"notmyidea"
#THEME = u"pelican-themes/subtle"
THEME = u"theme"

# commentaires
ISSO_SERVER="http://isso.cedeela.fr"

# Extensions
MD_EXTENSIONS = ['footnotes', 'fenced_code',
                 'codehilite(css_class=highlight,use_pygments=True)']
#MD_EXTENSIONS = ['latex','footnotes']
